import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import bnplApi from "../../api/bnplApi";
import orderApi from "../../api/orderApi";

/**
 * BNPLApplyPage — buyer submits a BNPL application for a specific order.
 * Flow: pre-check eligibility → pick bank → enter IBAN + upload docs → submit.
 *
 * Spec updates:
 *   - CNIC auto-format XXXXX-XXXXXXX-X
 *   - Validate CNIC entered matches account-creation CNIC (buyer.cnic)
 *   - Validate CNIC OCR extracted matches entered CNIC (best-effort on preview)
 *   - IBAN format-validation TEMPORARILY DISABLED (commented, kept for later)
 *   - IBAN-related errors surface in Step 2's "Review & Continue", not Step 3
 */

// CNIC formatter — auto-insert dashes as the user types (XXXXX-XXXXXXX-X)
function formatCnic(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 13);
  let out = digits;
  if (digits.length > 5) out = digits.slice(0, 5) + "-" + digits.slice(5);
  if (digits.length > 12) out = digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
  return out;
}

function isFullCnic(s) {
  return /^\d{5}-\d{7}-\d{1}$/.test(String(s || ""));
}

export default function BNPLApplyPage({ buyer }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [order, setOrder] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({
    bankId: "",
    iban: "",
    accountTitle: buyer?.name || "",
    planMonths: 3,
    cnicNumber: "",
  });
  const [files, setFiles] = useState({ cnic_front: null, cnic_back: null, utility_bill: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");    // surfaces INSIDE step 2 now
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!buyer?.buyer_id) return;
    orderApi.getOrder(orderId).then(r => { if (r.success) setOrder(r.order); });
    bnplApi.listBanks().then(r => { if (r.success) setBanks(r.banks); });
  }, [buyer, orderId]);

  const checkElig = async () => {
    setError(""); setLoading(true);
    try {
      const r = await bnplApi.checkEligibility(buyer.buyer_id, order.total_amount);
      if (!r.success) throw new Error(r.error);
      setEligibility(r);
      if (r.eligible) setStep(2); else setError(r.reasons.join(" "));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Called from Step 2 "Review & Continue" — validates everything before
  // moving to Step 3. IBAN/CNIC errors show in Step 2, not Step 3.
  const reviewAndContinue = () => {
    setError("");

    if (!form.bankId) { setError("Please select a bank."); return; }

    // IBAN format-validation temporarily disabled per spec.
    // ---- (kept commented; re-enable when required)
    // const ibanClean = String(form.iban || "").toUpperCase().replace(/\s/g, "");
    // const bank = banks.find(b => b.bank_id === form.bankId);
    // if (!/^PK\d{2}[A-Z]{4}\d{16}$/.test(ibanClean)) {
    //   setError("IBAN format is invalid (must be 24 chars, start with PK).");
    //   return;
    // }
    // if (bank?.code && !ibanClean.startsWith("PK") ) { ... }
    if (!form.iban || form.iban.replace(/\s/g, "").length < 5) {
      setError("Please enter an IBAN.");
      return;
    }

    if (!form.accountTitle.trim()) { setError("Please enter the account title."); return; }

    // CNIC must be present + fully formatted
    if (!isFullCnic(form.cnicNumber)) {
      setError("CNIC must match XXXXX-XXXXXXX-X format.");
      return;
    }
    // CNIC must match the CNIC used at account creation
    const acctCnic = String(buyer?.cnic || "").replace(/[^0-9]/g, "");
    const entered  = form.cnicNumber.replace(/[^0-9]/g, "");
    if (acctCnic && acctCnic !== entered) {
      setError("Entered CNIC does not match the CNIC used at account creation.");
      return;
    }

    // Documents required
    if (!files.cnic_front || !files.cnic_back || !files.utility_bill) {
      setError("Please upload CNIC front, CNIC back, and utility bill.");
      return;
    }

    setStep(3);
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await bnplApi.submitApplication({
        buyerId: buyer.buyer_id,
        orderId,
        bankId: form.bankId,
        iban: form.iban.toUpperCase(),
        accountTitle: form.accountTitle,
        planMonths: parseInt(form.planMonths, 10),
        cnicNumber: form.cnicNumber,
        cnicFront: files.cnic_front,
        cnicBack: files.cnic_back,
        utilityBill: files.utility_bill,
      });
      if (!r.success) throw new Error(r.error || "Submission failed");

      // Post-submit: if OCR extracted a CNIC, verify it matches the entered CNIC
      if (r.ocr?.extracted_cnic) {
        const ocr = r.ocr.extracted_cnic.replace(/[^0-9]/g, "");
        const entered = form.cnicNumber.replace(/[^0-9]/g, "");
        if (ocr && entered && ocr !== entered) {
          setError(`⚠ CNIC entered (${form.cnicNumber}) does not match uploaded CNIC image (${r.ocr.extracted_cnic}). Please re-upload the correct document.`);
          setLoading(false);
          setStep(2);
          return;
        }
      }
      setResult(r); setStep(4);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!order) return <div className="p-8 text-center text-gray-500">Loading order...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">BNPL Application</h1>
      <p className="text-sm text-gray-500 mb-4">Order #{orderId} • PKR {order.total_amount.toLocaleString()}</p>

      <div className="flex items-center mb-6 text-xs">
        {["Eligibility", "Bank & Documents", "Submit", "Done"].map((label, i) => (
          <React.Fragment key={label}>
            <div className={`flex items-center ${step >= i + 1 ? "text-[#a37b3d]" : "text-gray-400"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${step >= i + 1 ? "bg-[#a37b3d] text-white" : "bg-gray-200"}`}>{i + 1}</div>
              <span className="ml-1">{label}</span>
            </div>
            {i < 3 && <div className={`flex-1 h-px mx-2 ${step > i + 1 ? "bg-[#a37b3d]" : "bg-gray-200"}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Errors on step 1 only — step 2 errors render inline in step 2 (see below) */}
      {step !== 2 && error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">{error}</div>}

      {step === 1 && (
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold mb-2">Step 1: Check Eligibility</h2>
          <p className="text-sm text-gray-600 mb-4">We'll verify your profile and check for any active BNPL plans.</p>
          <ul className="text-sm text-gray-700 list-disc pl-5 mb-4">
            <li>Cart total: PKR {order.total_amount.toLocaleString()}</li>
            <li>Minimum BNPL amount: PKR 5,000</li>
            {order.total_amount < 50000 && <li>Fast-path available if you have prior approved applications (auto-approval).</li>}
          </ul>
          <button onClick={checkElig} disabled={loading}
            className="w-full py-2.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading ? "Checking..." : "Check Eligibility"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Step 2: Bank & Documents</h2>
          <div>
            <label className="text-xs font-semibold text-gray-600">SELECT BANK</label>
            <select value={form.bankId} onChange={e => setForm({ ...form, bankId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">— Select Bank —</option>
              {banks.map(b => <option key={b.bank_id} value={b.bank_id}>{b.name} ({b.code})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">IBAN</label>
            <input value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })}
              placeholder="PK36HBL1234567890123456"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase" />
            <p className="text-[10px] text-gray-400 mt-0.5">Format validation temporarily disabled.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">ACCOUNT TITLE</label>
            <input value={form.accountTitle} onChange={e => setForm({ ...form, accountTitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">PLAN</label>
            <div className="flex gap-2">
              {[3, 6].map(m => (
                <button key={m} type="button"
                  onClick={() => setForm({ ...form, planMonths: m })}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${form.planMonths === m ? "border-[#a37b3d] bg-[#FFF5F8] text-[#a37b3d]" : "border-gray-200 text-gray-600"}`}>
                  {m} Months
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">
              CNIC NUMBER (must match your account CNIC + uploaded document)
            </label>
            <input
              value={form.cnicNumber}
              onChange={e => setForm({ ...form, cnicNumber: formatCnic(e.target.value) })}
              maxLength={15}
              placeholder="35202-1234567-1"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 block">REQUIRED DOCUMENTS</label>
            {[
              { key: "cnic_front", label: "CNIC (Front)" },
              { key: "cnic_back", label: "CNIC (Back)" },
              { key: "utility_bill", label: "Utility Bill (Electricity/Gas)" },
            ].map(doc => (
              <div key={doc.key} className="flex items-center justify-between border border-gray-200 rounded-lg p-2">
                <span className="text-sm">{doc.label}</span>
                <input type="file" accept="image/*,application/pdf"
                  onChange={e => setFiles({ ...files, [doc.key]: e.target.files[0] })}
                  className="text-xs" />
              </div>
            ))}
          </div>

          {/* IBAN / CNIC errors surface here — inside Step 2 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          <button onClick={reviewAndContinue}
            className="w-full py-2.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-xl text-sm font-semibold">
            Review & Continue
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold">Step 3: Review & Submit</h2>
          <p className="text-sm">Order: <b>{orderId}</b> • PKR {order.total_amount.toLocaleString()}</p>
          <p className="text-sm">Bank: <b>{banks.find(b => b.bank_id === form.bankId)?.name}</b></p>
          <p className="text-sm">IBAN: <b className="font-mono">{form.iban}</b></p>
          <p className="text-sm">CNIC: <b className="font-mono">{form.cnicNumber}</b></p>
          <p className="text-sm">Plan: <b>{form.planMonths} months</b></p>
          <p className="text-sm">Documents: CNIC front, CNIC back, utility bill</p>
          {eligibility?.auto_approve && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-2 text-xs">
              ✓ Eligible for auto-approval (amount &lt; PKR 50,000 + prior verified docs).
            </div>
          )}
          <label className="flex items-center text-xs text-gray-600">
            <input type="checkbox" defaultChecked className="mr-2" />
            I confirm all information is correct and complete.
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm">Back</button>
            <button onClick={submit} disabled={loading}
              className="flex-1 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {loading ? "Submitting..." : "SUBMIT BNPL APPLICATION"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="bg-white rounded-2xl shadow p-6 space-y-3">
          <div className="text-center text-4xl">✅</div>
          <h2 className="text-lg font-semibold text-center">Application Submitted!</h2>
          <p className="text-center text-sm">Application #<b>{result.application.application_no}</b></p>
          <p className="text-center text-sm">Status: <b>{result.application.status}</b></p>
          {result.application.status === "APPROVED" && (
            <p className="text-center text-xs text-green-700">
              Auto-approved! Your offer letter is ready. Visit your BNPL dashboard to accept.
            </p>
          )}
          {result.ocr?.extracted_cnic && (
            <p className="text-center text-xs text-gray-500">
              OCR extracted CNIC: <span className="font-mono">{result.ocr.extracted_cnic}</span> (confidence: {Math.round((result.ocr.confidence || 0) * 100)}%)
            </p>
          )}
          <button onClick={() => navigate("/buyer/bnpl")}
            className="w-full py-2.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-xl text-sm font-semibold">
            Track Application
          </button>
        </div>
      )}
    </div>
  );
}

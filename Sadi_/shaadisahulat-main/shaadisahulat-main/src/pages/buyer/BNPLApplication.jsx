import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, FileText, Banknote, Calendar, CheckCircle, Info, Upload, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PLANS = [
  { months: 3, markup: '0%', description: 'Pay in 3 equal monthly installments' },
  { months: 6, markup: '5%', description: 'Flexible 6-month payment plan' },
  { months: 9, markup: '8%', description: 'Extended 9-month budget-friendly plan' },
];

const BNPLApplication = () => {
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState(3);
  const [formData, setFormData] = useState({
    cnic: '',
    bankName: '',
    accountNumber: '',
    salarySlip: null,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setStep(3); // Go to pending status
    toast.success('BNPL Application submitted successfully!');
  };

  return (
    <div className="min-h-screen bg-secondary-light py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-serif font-bold text-neutral-900 mb-4">Buy Now, Pay Later</h1>
          <p className="text-gray-500">Enable easy installments for your wedding essentials with ShaadiSahulat Financing.</p>
        </div>

        {step === 1 && (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-center mb-8">Select Your Installment Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PLANS.map((plan) => (
                <div 
                  key={plan.months}
                  onClick={() => setSelectedPlan(plan.months)}
                  className={`card relative cursor-pointer group transition-all ${selectedPlan === plan.months ? 'border-primary ring-2 ring-primary/10' : 'border-gray-100 hover:border-primary/30'}`}
                >
                  {selectedPlan === plan.months && (
                    <div className="absolute -top-3 -right-3 bg-primary text-white p-1 rounded-full shadow-lg">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  )}
                  <div className="text-center space-y-4">
                    <span className="inline-block px-3 py-1 bg-secondary text-primary text-[10px] font-bold rounded-full uppercase tracking-widest">{plan.markup} Markup</span>
                    <h3 className="text-4xl font-bold text-neutral-900">{plan.months} <span className="text-lg font-normal text-gray-400">Months</span></h3>
                    <p className="text-sm text-gray-500">{plan.description}</p>
                    <div className="pt-4 border-t border-gray-50">
                      <p className="text-xs font-semibold text-primary">Zero Hidden Charges</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-center mt-12">
              <button 
                onClick={() => setStep(2)}
                className="btn-primary px-12 py-4 text-lg flex items-center space-x-3"
              >
                <span>Continue Application</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card bg-white p-10 shadow-premium max-w-2xl mx-auto"
          >
            <h2 className="text-2xl font-bold mb-8 flex items-center space-x-3">
              <FileText className="w-6 h-6 text-primary" />
              <span>Identity & Bank Verification</span>
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">CNIC Number</label>
                <input 
                  type="text" 
                  required
                  placeholder="XXXXX-XXXXXXX-X"
                  className="input-field"
                  value={formData.cnic}
                  onChange={(e) => setFormData({...formData, cnic: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
                  <select 
                    className="input-field"
                    value={formData.bankName}
                    onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                  >
                    <option value="">Select Bank</option>
                    <option value="hbl">HBL</option>
                    <option value="mcb">MCB</option>
                    <option value="alfalah">Bank Alfalah</option>
                    <option value="meezan">Meezan Bank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Account Number / IBAN</label>
                  <input 
                    type="text" 
                    required
                    placeholder="PK00 XXXX XXXX ..."
                    className="input-field"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Salary Slip / Proof of Income</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary transition-colors cursor-pointer bg-gray-50">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-500 font-medium">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG or PNG (Max 5MB)</p>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Your information is encrypted and only used for credit assessment. Approval usually takes 24-48 hours.
                </p>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setStep(1)} className="flex-1 btn-secondary bg-white">Back</button>
                <button type="submit" className="flex-[2] btn-primary py-4">Submit Application</button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center bg-white p-16 rounded-3xl shadow-premium max-w-xl mx-auto"
          >
            <div className="inline-flex items-center justify-center w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full mb-8">
              <Calendar className="w-12 h-12 animate-pulse" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Application Pending</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              We've received your BNPL application for the <span className="font-bold text-neutral-900">{selectedPlan}-month plan</span>. Our team is currently reviewing your documents.
            </p>
            
            <div className="bg-secondary-light rounded-xl p-6 mb-10 text-left space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reference ID:</span>
                <span className="font-bold text-neutral-900">#BNPL-882910</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Estimated Approval:</span>
                <span className="font-bold text-primary">May 04, 2026</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status:</span>
                <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-bold uppercase tracking-wider">Verification Phase</span>
              </div>
            </div>

            <button className="btn-primary w-full py-4">View My Dashboard</button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BNPLApplication;

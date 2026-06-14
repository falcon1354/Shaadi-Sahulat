import React, { useState, useCallback, useEffect } from 'react';
import StepFinancial from './StepFinancial';
import StepFamily from './StepFamily';
import StepPriority from './StepPriority';
import StepResults from './StepResults';
import api from '../../api/dowryApi';
import { patchDowryBudgets } from '../../api/buyerApi';
import { useCategories } from '../../hooks/useCategories';
import { Sparkles, DollarSign, Users, Target, BarChart2, Check, ArrowRight, ArrowLeft, RefreshCw, Save, ShieldAlert } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Financial Profile', icon: <DollarSign size={18} /> },
  { id: 2, title: 'Family Context',    icon: <Users size={18} /> },
  { id: 3, title: 'Priority Settings', icon: <Target size={18} /> },
  { id: 4, title: 'Results Dashboard', icon: <BarChart2 size={18} /> },
];

const INITIAL_FORM = {
  monthly_household_income:   '',
  total_savings_available:    '',
  expected_contribution:      '',
  parents_alive:              'both',    // both | only_father | only_mother | neither
  total_siblings:             '',
  unmarried_siblings:         '',
  married_siblings:           '',
  youngest_sibling_age:       '',
  wedding_dress_type: 'bridal',          // bridal | groom
  priorities: {
    priority_wedding_dress: 'Medium',
    priority_furniture:     'Medium',
    priority_electronics:   'Medium',
    priority_kitchen_items: 'Medium',
    priority_decoration:    'Medium',
    priority_miscellaneous: 'Medium',
  },
  redistributions: {},                   // { priority_furniture: false }
};

function Wizard({ userId }) {
  const { categories: dbCats } = useCategories();

  // Dynamic categories from MongoDB; fall back to static list while loading
  const CATEGORIES = dbCats.length
    ? dbCats.map(c => ({
        key:             `priority_${c.category_id}`,
        label:           c.label,
        icon:            c.icon || '📦',
        hasTypeSelector: c.category_id === 'wedding_dress',
      }))
    : [
        { key: 'priority_wedding_dress', label: 'Wedding Dress', icon: '👗', hasTypeSelector: true },
        { key: 'priority_furniture',     label: 'Furniture',     icon: '🛋️' },
        { key: 'priority_electronics',   label: 'Electronics',   icon: '📺' },
        { key: 'priority_kitchen_items', label: 'Kitchen Items', icon: '🍳' },
        { key: 'priority_decoration',    label: 'Decoration',    icon: '🎀' },
        { key: 'priority_miscellaneous', label: 'Miscellaneous', icon: '📦' },
      ];

  const [currentStep,       setCurrentStep]       = useState(1);
  const [formData,          setFormData]           = useState(INITIAL_FORM);
  const [result,            setResult]             = useState(null);
  const [adjustedEstimates, setAdjustedEstimates]  = useState({});
  const [loading,           setLoading]            = useState(false);
  const [saved,             setSaved]              = useState(false);
  const [error,             setError]              = useState('');
  const [isLocked,          setIsLocked]           = useState(false); // existing estimation — read-only

  // When DB categories load, merge any new category keys into priorities with 'Medium' default
  useEffect(() => {
    if (!dbCats.length) return;
    setFormData(prev => {
      const merged = { ...prev.priorities };
      let changed = false;
      for (const cat of dbCats) {
        const key = `priority_${cat.category_id}`;
        if (!(key in merged)) { merged[key] = 'Medium'; changed = true; }
      }
      return changed ? { ...prev, priorities: merged } : prev;
    });
  }, [dbCats]);

  // If buyer already has an estimation, load from DB and populate localStorage
  useEffect(() => {
    if (!userId) return;
    api.getByUser(userId).then(res => {
      if (res.success && res.data) {
        let est = { ...res.data };

        // Reconstruct budget_sources for old buyers who don't have it stored
        if (!est.budget_sources?.from_income && est.income && est.total_recommended_budget) {
          const total = est.total_recommended_budget;
          const incomePortion  = Math.min(est.income * 12 * 0.4, total);
          const savingsPortion = total - incomePortion;
          est.budget_sources = {
            from_income:        Math.floor(incomePortion),
            from_savings:       Math.floor(savingsPortion),
            from_contribution:  est.expected_contribution || 0,
            income_percentage:  total > 0 ? parseFloat(((incomePortion / total) * 100).toFixed(1)) : 0,
            savings_percentage: total > 0 ? parseFloat(((savingsPortion / total) * 100).toFixed(1)) : 0,
          };
        }

        // Use category_budgets.estimated as adjustedEstimates
        if (est.category_budgets && Object.keys(est.category_budgets).length > 0) {
          const adjFromBudgets = {};
          for (const [cat, info] of Object.entries(est.category_budgets)) {
            adjFromBudgets[cat] = info?.estimated || 0;
          }
          setAdjustedEstimates(adjFromBudgets);
        } else {
          setAdjustedEstimates(est.adjusted_estimates || {});
        }

        setResult(est);
        setSaved(true);
        setIsLocked(true);
        setCurrentStep(4);

        // Populate localStorage from DB
        if (est.category_budgets && Object.keys(est.category_budgets).length > 0) {
          const totalFromBudgets = Object.values(est.category_budgets)
            .reduce((s, v) => s + (v?.estimated || 0), 0);
          const dowryPayload = JSON.stringify({
            estimation_id:    est._id,
            total_budget:     totalFromBudgets || est.total_recommended_budget,
            category_budgets: est.category_budgets,
            saved_at:         est.updated_at || est.created_at || new Date().toISOString(),
          });
          localStorage.setItem('ss_dowry_latest', dowryPayload);
          localStorage.setItem(`ss_dowry_${userId}`, dowryPayload);
        }
      }
    }).catch(() => {});
  }, [userId]);

  // In locked mode, re-sync adjustedEstimates when budget is shifted from any component
  useEffect(() => {
    if (!isLocked || !userId) return;
    const handler = (e) => {
      if (!e.detail?.buyerId || e.detail.buyerId === userId) {
        const local = JSON.parse(localStorage.getItem(`ss_dowry_${userId}`) || 'null');
        if (local?.category_budgets) {
          const adj = {};
          for (const [cat, info] of Object.entries(local.category_budgets)) {
            adj[cat] = info?.estimated || 0;
          }
          setAdjustedEstimates(adj);
        }
      }
    };
    window.addEventListener('dowry-updated', handler);
    return () => window.removeEventListener('dowry-updated', handler);
  }, [isLocked, userId]);

  const updateForm = useCallback((updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const updatePriority = useCallback((key, value) => {
    setFormData((prev) => ({
      ...prev,
      priorities: { ...prev.priorities, [key]: value },
    }));
  }, []);

  const updateRedistribution = useCallback((key, value) => {
    setFormData((prev) => ({
      ...prev,
      redistributions: { ...prev.redistributions, [key]: value },
    }));
  }, []);

  const handleNext = () => {
    setError('');
    if (currentStep === 1) {
      if (!formData.monthly_household_income || Number(formData.monthly_household_income) <= 0) {
        setError('Monthly household income is required and must be greater than 0');
        return;
      }
      if (!formData.total_savings_available || Number(formData.total_savings_available) < 0) {
        setError('Total savings is required');
        return;
      }
    }
    if (currentStep === 2) {
      if (formData.total_siblings === '' || formData.total_siblings === undefined) {
        setError('Total siblings count is required (enter 0 if none)');
        return;
      }
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const handleEstimate = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = buildPayload(formData);
      const response = await api.estimate(payload);
      if (response.success) {
        setResult(response.data);
        setAdjustedEstimates({ ...response.data.category_breakdown });
        setCurrentStep(4);
      } else {
        setError(response.error || 'Estimation failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Server error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setLoading(true);
    try {
      const payload = {
        ...buildPayload(formData),
        user_id:             userId,
        adjusted_estimates:  adjustedEstimates,
      };
      const response = await api.upsert(payload);
      if (response.success) {
        setSaved(true);
        if (response.data?.category_breakdown) {
          const catBudgets = {};
          for (const [cat, amt] of Object.entries(response.data.category_breakdown)) {
            catBudgets[cat] = {
              estimated:  adjustedEstimates[cat] !== undefined ? adjustedEstimates[cat] : amt,
              spent:      0,
              remaining:  adjustedEstimates[cat] !== undefined ? adjustedEstimates[cat] : amt,
              active:     (payload.priorities?.[`priority_${cat}`] || 'Medium') !== 'Not_Wanted',
            };
          }
          const dowryPayload = JSON.stringify({
            estimation_id:    response.estimation_id,
            total_budget:     response.data.total_recommended_budget,
            category_budgets: catBudgets,
            saved_at:         new Date().toISOString(),
          });
          localStorage.setItem('ss_dowry_latest', dowryPayload);
          if (userId) {
            localStorage.setItem(`ss_dowry_${userId}`, dowryPayload);
            patchDowryBudgets(userId, catBudgets).catch(() => {});
            window.dispatchEvent(new CustomEvent('dowry-updated', { detail: { buyerId: userId } }));
          }
        }
      } else {
        setError(response.error || 'Save failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData(INITIAL_FORM);
    setResult(null);
    setAdjustedEstimates({});
    setSaved(false);
    setCurrentStep(1);
    setError('');
  };

  // Locked mode dashboard
  if (isLocked && result) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-5 text-sm text-purple-900 shadow-sm flex items-start gap-4">
          <div className="p-2.5 bg-white rounded-xl shadow-inner border border-purple-200 shrink-0 text-purple-600">
            <Sparkles size={20} />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 tracking-tight text-base mb-1">Your Dowry Budget Plan is Finalized</h4>
            <p className="text-gray-600 leading-relaxed font-light text-xs sm:text-sm">
              Use the budget re-allocation sliders inside the results dashboard below to dynamically move funds from one category to another as your priorities evolve.
            </p>
          </div>
        </div>
        <div className="bg-white rounded-3xl shadow-lg border border-purple-100 p-6 md:p-8">
          <StepResults
            result={result}
            loading={false}
            saved={true}
            adjustedEstimates={adjustedEstimates}
            onAdjust={null}
            onSave={null}
            onReset={null}
            priorities={result.priorities || {}}
            categories={dbCats}
            buyerId={userId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12 animate-fade-in">
      {/* Wizard Steps - Glassmorphism Indicator */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-purple-50 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-2">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <React.Fragment key={step.id}>
                <div
                  className="flex items-center gap-3 cursor-pointer group transition-all duration-300"
                  onClick={() => {
                    if (step.id < currentStep) setCurrentStep(step.id);
                    if (step.id === 4 && result) setCurrentStep(4);
                  }}
                >
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold transition-all duration-300 border ${
                      isActive
                        ? 'bg-gradient-to-tr from-violet-600 to-pink-500 text-white shadow-md shadow-purple-500/25 border-transparent scale-105'
                        : isCompleted
                        ? 'bg-purple-50 border-purple-100 text-purple-600'
                        : 'bg-gray-50 border-gray-100 text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-600'
                    }`}
                  >
                    {isCompleted ? <Check size={18} /> : step.icon}
                  </div>
                  <div className="text-left">
                    <p className={`text-[10px] uppercase font-bold tracking-wider ${isActive ? 'text-purple-600' : 'text-gray-400'}`}>Step 0{step.id}</p>
                    <p className={`text-xs font-bold ${isActive ? 'text-gray-950' : 'text-gray-500 group-hover:text-gray-700'}`}>{step.title}</p>
                  </div>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`hidden sm:block flex-1 h-0.5 max-w-[50px] md:max-w-[80px] rounded-full transition-colors duration-300 ${
                      currentStep > step.id ? 'bg-gradient-to-r from-violet-500 to-purple-500' : 'bg-gray-100'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Error Alert Box */}
      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-2xl text-xs md:text-sm flex items-center gap-3 animate-pulse">
          <ShieldAlert className="text-rose-500 shrink-0" size={20} />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Primary Card Container */}
      <div className="bg-white rounded-3xl border border-purple-50/50 shadow-xl shadow-purple-500/[0.02] p-6 md:p-8 min-h-[400px] flex flex-col justify-between">
        <div className="mb-8">
          {currentStep === 1 && (
            <StepFinancial formData={formData} updateForm={updateForm} />
          )}
          {currentStep === 2 && (
            <StepFamily formData={formData} updateForm={updateForm} />
          )}
          {currentStep === 3 && (
            <StepPriority
              formData={formData}
              categories={CATEGORIES}
              updatePriority={updatePriority}
              updateRedistribution={updateRedistribution}
              updateForm={updateForm}
            />
          )}
          {currentStep === 4 && (
            <StepResults
              result={result}
              loading={loading}
              saved={saved}
              adjustedEstimates={adjustedEstimates}
              onAdjust={(key, val) =>
                setAdjustedEstimates((prev) => ({ ...prev, [key]: val }))
              }
              onSave={handleSave}
              onReset={handleReset}
              priorities={formData.priorities}
              categories={dbCats}
              buyerId={userId}
            />
          )}
        </div>

        {/* Wizard Footer controls */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-100/80">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="px-5 py-2.5 rounded-2xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2 text-sm"
          >
            <ArrowLeft size={16} /> Back
          </button>
          
          <div className="flex items-center gap-3">
            {currentStep === 4 && result && !saved && (
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2 text-sm shadow-md shadow-emerald-500/10"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                {loading ? 'Saving...' : 'Save Plan'}
              </button>
            )}

            {currentStep < 4 && (
              <button
                onClick={currentStep === 3 ? handleEstimate : handleNext}
                disabled={loading}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2 text-sm shadow-lg shadow-purple-500/10"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} />
                    <span>Calculating...</span>
                  </>
                ) : (
                  <>
                    <span>{currentStep === 3 ? 'Calculate Estimate' : 'Continue'}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildPayload(formData) {
  const unmarried    = Number(formData.unmarried_siblings   || 0);
  const married      = Number(formData.married_siblings     || 0);
  const total        = Number(formData.total_siblings       || 0);
  const parentsAlive = formData.parents_alive || 'both';
  const youngestAge  = Number(formData.youngest_sibling_age || 0);
  const ageArray = youngestAge > 0 && unmarried > 0
    ? Array(unmarried).fill(youngestAge)
    : [];
  return {
    monthly_household_income:    Number(formData.monthly_household_income),
    total_savings_available:     Number(formData.total_savings_available),
    expected_contribution:       Number(formData.expected_contribution || 0),
    total_family_members:        total + 2,
    married_children_count:      married,
    unmarried_children_count:    unmarried,
    age_of_each_unmarried_child: ageArray,
    father_approval:             parentsAlive === 'both' || parentsAlive === 'only_father',
    mother_approval:             parentsAlive === 'both' || parentsAlive === 'only_mother',
    priorities:                  formData.priorities,
    redistributions:             formData.redistributions,
    wedding_dress_type:          formData.wedding_dress_type,
  };
}

export default Wizard;

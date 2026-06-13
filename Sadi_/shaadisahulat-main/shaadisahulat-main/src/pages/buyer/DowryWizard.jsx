import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, Wallet, Users, Heart, ArrowRight, ArrowLeft, CheckCircle2, PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const STEPS = [
  { id: 1, title: 'Financials', icon: Wallet },
  { id: 2, title: 'Family', icon: Users },
  { id: 3, title: 'Preferences', icon: Heart },
  { id: 4, title: 'Result', icon: CheckCircle2 },
];

const DowryWizard = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    monthlyIncome: '',
    savings: '',
    familyMembers: '',
    weddingDate: '',
    preference: 'moderate', // conservative, moderate, luxury
  });
  const [result, setResult] = useState(null);

  const handleCalculate = () => {
    // Mock calculation logic
    const income = parseInt(formData.monthlyIncome) || 0;
    const savings = parseInt(formData.savings) || 0;
    
    let multiplier = 5;
    if (formData.preference === 'conservative') multiplier = 3;
    if (formData.preference === 'luxury') multiplier = 10;

    const totalBudget = (income * multiplier) + (savings * 0.5);
    
    const breakdown = [
      { name: 'Furniture', value: totalBudget * 0.35, color: '#4A5568' },
      { name: 'Electronics', value: totalBudget * 0.25, color: '#2D3748' },
      { name: 'Apparel', value: totalBudget * 0.2, color: '#C21E56' },
      { name: 'Kitchenware', value: totalBudget * 0.15, color: '#718096' },
      { name: 'Other', value: totalBudget * 0.05, color: '#A0AEC0' },
    ];

    setResult({ totalBudget, breakdown });
    setStep(4);
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="min-h-screen bg-secondary-light py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-serif font-bold text-neutral-900 mb-4">Dowry & Wedding Budget Estimator</h1>
          <p className="text-gray-500">Plan your special day with financial clarity and AI-driven insights.</p>
        </div>

        {/* Progress Tracker */}
        <div className="flex justify-between items-center mb-12 px-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2"></div>
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step >= s.id;
            return (
              <div key={s.id} className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${active ? 'bg-primary text-white scale-110' : 'bg-white text-gray-300 border-2 border-gray-100'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs font-bold mt-2 ${active ? 'text-primary' : 'text-gray-300'}`}>{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-3xl shadow-premium p-8 md:p-12">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold mb-6">Financial Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Monthly Income (PKR)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      placeholder="e.g. 100000"
                      value={formData.monthlyIncome}
                      onChange={(e) => setFormData({...formData, monthlyIncome: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Current Savings (PKR)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      placeholder="e.g. 500000"
                      value={formData.savings}
                      onChange={(e) => setFormData({...formData, savings: e.target.value})}
                    />
                  </div>
                </div>
                <button onClick={nextStep} className="w-full btn-primary py-4 flex items-center justify-center space-x-2">
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold mb-6">Family & Timeline</h2>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Family Members</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="e.g. 4"
                    value={formData.familyMembers}
                    onChange={(e) => setFormData({...formData, familyMembers: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Tentative Wedding Date</label>
                  <input 
                    type="date" 
                    className="input-field"
                    value={formData.weddingDate}
                    onChange={(e) => setFormData({...formData, weddingDate: e.target.value})}
                  />
                </div>
                <div className="flex space-x-4">
                  <button onClick={prevStep} className="flex-1 btn-secondary py-4 flex items-center justify-center space-x-2 bg-white">
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back</span>
                  </button>
                  <button onClick={nextStep} className="flex-[2] btn-primary py-4 flex items-center justify-center space-x-2">
                    <span>Continue</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold mb-6">Wedding Preferences</h2>
                <div className="grid grid-cols-1 gap-4">
                  {['conservative', 'moderate', 'luxury'].map((p) => (
                    <div 
                      key={p}
                      onClick={() => setFormData({...formData, preference: p})}
                      className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${formData.preference === p ? 'border-primary bg-primary/5' : 'border-gray-100'}`}
                    >
                      <h3 className="font-bold capitalize">{p} Wedding</h3>
                      <p className="text-sm text-gray-500">
                        {p === 'conservative' && 'Focus on essentials and tradition.'}
                        {p === 'moderate' && 'Balanced mix of quality and affordability.'}
                        {p === 'luxury' && 'Premium brands and high-end experiences.'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-4">
                  <button onClick={prevStep} className="flex-1 btn-secondary py-4 flex items-center justify-center space-x-2 bg-white">
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back</span>
                  </button>
                  <button onClick={handleCalculate} className="flex-[2] btn-primary py-4 flex items-center justify-center space-x-2">
                    <Calculator className="w-5 h-5" />
                    <span>Calculate Budget</span>
                  </button>
                </div>
              </motion.div>
            )}

            {step === 4 && result && (
              <motion.div 
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 text-green-600 rounded-full mb-6">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold mb-2">Estimation Complete!</h2>
                <p className="text-gray-500 mb-10">Based on your inputs, here is your recommended budget.</p>
                
                <div className="bg-secondary-light rounded-3xl p-8 mb-8">
                  <p className="text-sm font-bold text-primary uppercase tracking-widest mb-1">Total Estimated Budget</p>
                  <p className="text-5xl font-bold text-neutral-900">PKR {result.totalBudget.toLocaleString()}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-10">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={result.breakdown}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {result.breakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-left space-y-4">
                    {result.breakdown.map((item) => (
                      <div key={item.name} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                          <span className="font-semibold">{item.name}</span>
                        </div>
                        <span className="text-gray-500">PKR {item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-4 bg-white">Edit Data</button>
                  <button className="flex-1 btn-primary py-4">Confirm & Save Budget</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default DowryWizard;

import React, { useState } from 'react';
import { Calculator } from 'lucide-react';
import Wizard from './Wizard';

export default function DowryPage({ userId }) {
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-100 text-violet-600 rounded-full mb-4 shadow-sm">
          <Calculator size={32} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          Dowry Budget Estimation
        </h2>
        <p className="text-gray-500 max-w-xl mx-auto">
          Get a personalized dowry budget estimate.
          Enter your financial and family details to get started.
        </p>
      </div>
      <Wizard userId={userId} />
    </div>
  );
}

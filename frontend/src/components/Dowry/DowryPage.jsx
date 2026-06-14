import React, { useState } from 'react';
import Wizard from './Wizard';

export default function DowryPage({ userId }) {
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          💰 Dowry Budget Estimation
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

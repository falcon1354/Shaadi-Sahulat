import React from 'react';

export default function LandingPage({ onSelectBuyer, onSelectSeller }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-500 rounded-3xl flex items-center justify-center text-white text-4xl mx-auto mb-4 shadow-lg">
            💍
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2">ShaadiSahulat</h1>
          <p className="text-lg text-gray-600">Your Complete Wedding Planning Platform</p>
          <p className="text-sm text-gray-400 mt-2">Smart budgeting, AI-powered dress matching, and seamless shopping</p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Buyer Card */}
          <div
            onClick={onSelectBuyer}
            className="group cursor-pointer bg-white rounded-2xl shadow-sm border border-purple-100 hover:border-purple-300 hover:shadow-xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="h-32 bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <span className="text-6xl group-hover:scale-110 transition-transform duration-300">👰</span>
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">I'm a Buyer</h2>
              <p className="text-sm text-gray-600 mb-4">Bride, groom, or wedding planner</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-purple-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Smart dowry estimation wizard</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-purple-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">AI dress matching by photo</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-purple-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Browse marketplace & shopping cart</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-purple-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Track spending & analytics</span>
                </div>
              </div>

              <button
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-purple-700 transition-all shadow-md group-hover:shadow-lg"
              >
                Continue as Buyer →
              </button>
            </div>
          </div>

          {/* Seller Card */}
          <div
            onClick={onSelectSeller}
            className="group cursor-pointer bg-white rounded-2xl shadow-sm border border-pink-100 hover:border-pink-300 hover:shadow-xl transition-all duration-300 overflow-hidden hover:scale-105"
          >
            <div className="h-32 bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center">
              <span className="text-6xl group-hover:scale-110 transition-transform duration-300">🏪</span>
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">I'm a Seller</h2>
              <p className="text-sm text-gray-600 mb-4">Designer, tailor, or boutique owner</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-pink-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Upload & manage products</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-pink-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Smart price range suggestions</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-pink-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Dashboard & analytics</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-pink-500 font-bold mt-0.5">✓</span>
                  <span className="text-sm text-gray-600">Financial projections & reports</span>
                </div>
              </div>

              <button
                className="w-full px-4 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-xl font-semibold hover:from-pink-600 hover:to-pink-700 transition-all shadow-md group-hover:shadow-lg"
              >
                Continue as Seller →
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-400">
          <p>ShaadiSahulat © 2026 | FYP | NUCES Chiniot-Faisalabad</p>
          <p className="mt-2">Both roles can use all features. Choose your primary role above.</p>
        </div>
      </div>
    </div>
  );
}

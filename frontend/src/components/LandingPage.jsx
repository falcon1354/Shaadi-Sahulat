import React from 'react';
import { ShoppingBag, Store, CheckCircle2, ArrowRight } from 'lucide-react';
import logo from '../assets/ShaadiSahulat Logo PNG.png';

export default function LandingPage({ onSelectBuyer, onSelectSeller }) {
  return (
    <div className="min-h-screen bg-[#FCFBFB] relative overflow-hidden flex items-center justify-center px-4 font-sans">
      
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#FDF2F3] rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-pulse-glow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-[#FEF4F7] rounded-full mix-blend-multiply filter blur-[120px] opacity-60"></div>
      
      <div className="w-full max-w-4xl relative z-10 animate-fade-in py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-32 h-32 mx-auto mb-6 flex items-center justify-center">
            <img src={logo} alt="ShaadiSahulat Logo" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h1 className="font-heading text-5xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-700 via-pink-500 to-rose-400 mb-4 tracking-tight">
            ShaadiSahulat
          </h1>
          <p className="text-xl text-gray-600 font-light mb-2">Your Complete Wedding Planning Platform</p>
          <p className="text-sm text-gray-500 bg-white/50 inline-block px-4 py-1.5 rounded-full border border-gray-100 shadow-sm">Smart budgeting, AI matching, and seamless shopping</p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Buyer Card */}
          <div
            onClick={onSelectBuyer}
            className="group cursor-pointer glass-card rounded-[2rem] p-2 hover-lift transition-all duration-300 overflow-hidden relative border border-[#FBEFF1]"
          >
            <div className="h-40 bg-gradient-to-br from-[#1a0a1e] via-[#2d2044] to-[#3d3060] rounded-[1.5rem] flex items-center justify-center relative overflow-hidden border border-white/10">
              <div className="absolute inset-0 bg-purple-500/10 rounded-[1.5rem]" />
              <ShoppingBag size={64} color="white" strokeWidth={1} className="group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 ease-out drop-shadow-md relative z-10" />
            </div>
            <div className="p-8">
              <h2 className="font-heading text-2xl font-bold text-gray-800 mb-2">I'm a Buyer</h2>
              <p className="text-sm text-gray-500 mb-6 font-light">Bride, groom, or wedding planner</p>
              
              <div className="space-y-3 mb-8">
                {[
                  "Smart dowry estimation wizard",
                  "AI dress matching by photo",
                  "Browse marketplace & shopping cart",
                  "Track spending & analytics"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-purple-600 flex-shrink-0" />
                    <span className="text-sm text-gray-600 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              <button
                className="w-full px-4 py-3.5 bg-gradient-to-r from-purple-700 to-pink-500 text-white font-bold rounded-xl hover:opacity-95 transition-opacity shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                Continue as Buyer 
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Seller Card */}
          <div
            onClick={onSelectSeller}
            className="group cursor-pointer glass-card rounded-[2rem] p-2 hover-lift transition-all duration-300 overflow-hidden relative border border-[#FBEFF1]"
          >
            <div className="h-40 bg-gradient-to-br from-[#0a1020] via-[#1a2040] to-[#252d55] rounded-[1.5rem] flex items-center justify-center relative overflow-hidden border border-white/10">
               <div className="absolute inset-0 bg-indigo-500/10 rounded-[1.5rem]" />
               <Store size={64} className="text-white group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 ease-out drop-shadow-md relative z-10" strokeWidth={1} />
            </div>
            <div className="p-8">
              <h2 className="font-heading text-2xl font-bold text-gray-800 mb-2">I'm a Seller</h2>
              <p className="text-sm text-gray-500 mb-6 font-light">Designer, tailor, or boutique owner</p>
              
              <div className="space-y-3 mb-8">
                {[
                  "Upload & manage products",
                  "Smart price range suggestions",
                  "Dashboard & analytics",
                  "Financial projections & reports"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-indigo-600 flex-shrink-0" />
                    <span className="text-sm text-gray-600 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              <button
                className="w-full px-4 py-3.5 bg-gradient-to-r from-indigo-700 to-violet-500 text-white font-bold rounded-xl hover:opacity-95 transition-opacity shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                Continue as Seller 
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-400 font-medium">
          <p>ShaadiSahulat © 2026 | FYP | NUCES Chiniot-Faisalabad</p>
          <p className="mt-2 text-xs opacity-75">Both roles can use all features. Choose your primary role above.</p>
        </div>
      </div>
    </div>
  );
}

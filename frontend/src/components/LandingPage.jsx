import React from 'react';
import { Gem, ShoppingBag, Store, CheckCircle2, ArrowRight } from 'lucide-react';

export default function LandingPage({ onSelectBuyer, onSelectSeller }) {
  return (
    <div className="min-h-screen bg-[#FAFAFA] relative overflow-hidden flex items-center justify-center px-4 font-sans">
      
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse-glow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-pink-300 rounded-full mix-blend-multiply filter blur-[120px] opacity-40"></div>
      
      <div className="w-full max-w-4xl relative z-10 animate-fade-in py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-24 h-24 bg-white/60 backdrop-blur-md rounded-3xl flex items-center justify-center text-rose-500 mx-auto mb-6 shadow-soft border border-white relative group">
            <div className="absolute inset-0 bg-rose-500 rounded-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-500"></div>
            <Gem size={44} strokeWidth={1.5} className="drop-shadow-sm group-hover:scale-110 transition-transform duration-500" />
          </div>
          <h1 className="font-heading text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 via-fuchsia-500 to-rose-500 mb-4 tracking-tight">
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
            className="group cursor-pointer glass-card rounded-[2rem] p-2 hover-lift transition-all duration-300 overflow-hidden relative"
          >
            <div className="h-40 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-[1.5rem] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
              <ShoppingBag size={64} color="white" strokeWidth={1} className="group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 ease-out drop-shadow-md" />
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
                    <CheckCircle2 size={18} className="text-violet-500 flex-shrink-0" />
                    <span className="text-sm text-gray-600 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              <button
                className="w-full px-4 py-3.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                Continue as Buyer 
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Seller Card */}
          <div
            onClick={onSelectSeller}
            className="group cursor-pointer glass-card rounded-[2rem] p-2 hover-lift transition-all duration-300 overflow-hidden relative"
          >
            <div className="h-40 bg-gradient-to-br from-pink-500 to-rose-500 rounded-[1.5rem] flex items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
               <Store size={64} color="white" strokeWidth={1} className="group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 ease-out drop-shadow-md" />
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
                    <CheckCircle2 size={18} className="text-rose-500 flex-shrink-0" />
                    <span className="text-sm text-gray-600 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              <button
                className="w-full px-4 py-3.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-md hover:shadow-lg flex items-center justify-center gap-2"
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

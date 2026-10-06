import React from 'react';
import { ShoppingBag, Store, ArrowRight } from 'lucide-react';
import logo from '../assets/ShaadiSahulat Logo PNG.png';
import mainHeroImg from '../assets/hero/Main.jpeg';

export default function LandingPage({ onSelectBuyer, onSelectSeller }) {
  return (
    <div className="min-h-screen bg-[#f6f7f2] relative overflow-hidden flex items-center justify-center px-4 sm:px-6 font-sans">
      
      {/* 60% Opacity Full Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80 pointer-events-none"
        style={{ backgroundImage: `url(${mainHeroImg})` }}
      />
      
      <div className="w-full max-w-5xl relative z-10 py-12">
        {/* Clean Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
            <img src={logo} alt="ShaadiSahulat Logo" className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-black tracking-tight drop-shadow-lg">
            <span className="text-[#d43558]">Shaadi</span>
            <span className="text-[#f2bc66]">Sahulat</span>
          </h1>
          <p className="text-lg sm:text-xl text-[#f051b0] font-bold mt-2 drop-shadow-md">
            Your Complete Wedding Planning Platform
          </p>
        </div>

        {/* Streamlined Role Selection Cards */}
        <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-3xl mx-auto">
          {/* Buyer Card */}
          <div
            onClick={onSelectBuyer}
            className="group cursor-pointer bg-black/40 hover:bg-black/50 backdrop-blur-md rounded-3xl p-6 sm:p-7 border border-white/20 hover:border-[#ECD4A8] transition-all duration-300 shadow-2xl hover:-translate-y-1.5 flex flex-col justify-between"
          >
            <div>
              <div className="w-16 h-16 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-2xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <ShoppingBag size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 drop-shadow">I'm a Buyer</h2>
              <p className="text-sm text-gray-200 font-medium mb-6 drop-shadow-sm">
                Explore budget estimation, AI dress matching, and verified retail & thrift wedding collections.
              </p>
            </div>

            <button
              className="w-full py-3.5 px-5 bg-gradient-to-r from-[#a37b3d] to-[#c69a54] text-white font-bold rounded-xl hover:brightness-110 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              Continue as Buyer
              <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
            </button>
          </div>

          {/* Seller Card */}
          <div
            onClick={onSelectSeller}
            className="group cursor-pointer bg-black/40 hover:bg-black/50 backdrop-blur-md rounded-3xl p-6 sm:p-7 border border-white/20 hover:border-indigo-400 transition-all duration-300 shadow-2xl hover:-translate-y-1.5 flex flex-col justify-between"
          >
            <div>
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-500 rounded-2xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Store size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 drop-shadow">I'm a Seller</h2>
              <p className="text-sm text-gray-200 font-medium mb-6 drop-shadow-sm">
                List new or pre-owned wedding items, manage orders, and access real-time financial analytics.
              </p>
            </div>

            <button
              className="w-full py-3.5 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:brightness-110 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              Continue as Seller
              <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="text-center mt-12 text-xs text-white font-medium tracking-wide drop-shadow">
          ShaadiSahulat © 2026 | NUCES Chiniot-Faisalabad
        </div>
      </div>
    </div>
  );
}

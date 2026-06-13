import React from 'react';
import { motion } from 'framer-motion';
import { Package, Truck, CheckCircle, Clock, AlertTriangle, MessageSquare, ChevronRight } from 'lucide-react';

const TRACKING_STEPS = [
  { id: 'processing', label: 'Processing', icon: Package, date: 'May 01, 10:30 AM', status: 'complete' },
  { id: 'shipped', label: 'Shipped', icon: Truck, date: 'May 02, 02:15 PM', status: 'current' },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle, date: 'Expected May 05', status: 'pending' },
  { id: 'done', label: 'Done', icon: Clock, date: '--', status: 'pending' },
];

const OrderTracking = () => {
  return (
    <div className="min-h-screen bg-secondary-light py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
          <div>
            <h1 className="text-3xl font-serif font-bold text-neutral-900 mb-2">Track Order #SS-92810</h1>
            <p className="text-gray-500">Placed on May 01, 2026 • 2 items</p>
          </div>
          <button className="mt-4 md:mt-0 flex items-center space-x-2 text-primary font-bold hover:underline">
            <span>Download Invoice</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Timeline UI */}
        <div className="card bg-white p-12 shadow-premium mb-8 overflow-hidden relative">
          <div className="flex flex-col md:flex-row justify-between items-center relative space-y-12 md:space-y-0">
            {/* Horizontal Line - Desktop */}
            <div className="absolute top-[28px] left-[10%] w-[80%] h-1 bg-gray-100 hidden md:block"></div>
            
            {TRACKING_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isComplete = step.status === 'complete';
              const isCurrent = step.status === 'current';
              
              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center text-center">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 mb-4 ${isComplete ? 'bg-primary text-white' : isCurrent ? 'bg-secondary text-primary border-2 border-primary shadow-lg shadow-primary/20' : 'bg-gray-50 text-gray-300 border-2 border-gray-100'}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className={`text-sm font-bold mb-1 ${isComplete || isCurrent ? 'text-neutral-900' : 'text-gray-400'}`}>{step.label}</h3>
                  <p className="text-[10px] text-gray-400 font-medium">{step.date}</p>
                  
                  {isCurrent && (
                    <div className="absolute -top-10 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap animate-bounce">
                      In Transit
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Item List */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-xl font-bold mb-6">Order Items</h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center space-x-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50">
                <img src="https://images.unsplash.com/photo-1505693419148-ad30b3a4e33b?w=200" alt="product" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-neutral-900">Premium Bedroom Set</h4>
                <p className="text-xs text-gray-500">Qty: 1 • Color: Walnut</p>
                <p className="text-sm font-bold text-primary mt-1">PKR 225,000</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center space-x-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50">
                <img src="https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=200" alt="product" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-neutral-900">Bridal Lehenga</h4>
                <p className="text-xs text-gray-500">Qty: 1 • Size: Medium</p>
                <p className="text-sm font-bold text-primary mt-1">PKR 85,000</p>
              </div>
            </div>
          </div>

          {/* Actions & Shipping */}
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-6">Delivery Address</h2>
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <p className="font-bold text-neutral-900 mb-1">Ahmad Hassan</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  House #42, Street 7, Model Town<br />
                  Lahore, Punjab 54000<br />
                  Pakistan
                </p>
                <p className="text-sm font-semibold mt-4">+92 300 1234567</p>
              </div>
            </div>

            <div className="space-y-3">
              <button className="w-full btn-primary py-4 flex items-center justify-center space-x-2">
                <CheckCircle className="w-5 h-5" />
                <span>I have received item</span>
              </button>
              <button className="w-full btn-secondary py-4 flex items-center justify-center space-x-2 bg-white text-accent border-accent hover:bg-accent/5">
                <AlertTriangle className="w-5 h-5" />
                <span>Report Issue</span>
              </button>
              <button className="w-full py-3 flex items-center justify-center space-x-2 text-gray-400 hover:text-primary transition-colors text-sm font-semibold">
                <MessageSquare className="w-4 h-4" />
                <span>Contact Seller</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderTracking;

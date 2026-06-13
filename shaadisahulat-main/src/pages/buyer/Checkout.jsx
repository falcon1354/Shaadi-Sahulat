import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, CreditCard, ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const Checkout = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleOrder = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setStep(3);
      toast.success('Order placed successfully!');
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {step < 3 && (
          <div className="flex items-center justify-between mb-12">
            <button onClick={() => navigate(-1)} className="flex items-center space-x-2 text-gray-500 hover:text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold">Return to Cart</span>
            </button>
            <div className="flex items-center space-x-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
              <div className="w-8 h-px bg-gray-200"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-8">
              <div className="card bg-white p-8">
                <h2 className="text-2xl font-bold mb-8 flex items-center space-x-3">
                  <MapPin className="w-6 h-6 text-primary" />
                  <span>Shipping Address</span>
                </h2>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                    <input type="text" className="input-field" placeholder="John Doe" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Address</label>
                    <input type="text" className="input-field" placeholder="House #, Street, Area" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">City</label>
                    <input type="text" className="input-field" placeholder="Lahore" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Phone</label>
                    <input type="tel" className="input-field" placeholder="+92 XXX XXXXXXX" />
                  </div>
                </form>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)} className="btn-primary px-12 py-4 text-lg">Continue to Payment</button>
              </div>
            </div>
            
            <div className="card bg-white p-8 h-fit border-2 border-secondary-dark shadow-premium">
              <h3 className="text-xl font-bold mb-6">In Your Cart</h3>
              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 italic">2 items</span>
                  <span className="font-bold text-neutral-900 font-serif">PKR 210,000</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed text-center italic">
                Taxes and shipping calculated at checkout.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-8">
              <div className="card bg-white p-8">
                <h2 className="text-2xl font-bold mb-8 flex items-center space-x-3">
                  <CreditCard className="w-6 h-6 text-primary" />
                  <span>Payment Method</span>
                </h2>
                
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl border-2 border-primary bg-primary/5 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-100 shadow-sm">
                        <CreditCard className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-neutral-900">Credit / Debit Card</p>
                        <p className="text-xs text-gray-500">Pay securely with your Visa or Mastercard</p>
                      </div>
                    </div>
                    <div className="w-5 h-5 rounded-full border-4 border-primary"></div>
                  </div>

                  <div className="p-6 rounded-2xl border border-gray-100 flex items-center justify-between cursor-not-allowed opacity-60">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100">
                        <ShieldCheck className="w-6 h-6 text-gray-300" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-400">Cash on Delivery</p>
                        <p className="text-xs text-gray-300">Currently unavailable for high-value items</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 pt-10 border-t border-gray-100 grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Card Number</label>
                    <input type="text" className="input-field" placeholder="0000 0000 0000 0000" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Expiry Date</label>
                      <input type="text" className="input-field" placeholder="MM/YY" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">CVC</label>
                      <input type="text" className="input-field" placeholder="***" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <button onClick={() => setStep(1)} className="flex-1 btn-secondary bg-white">Back</button>
                <button 
                  onClick={handleOrder} 
                  disabled={loading}
                  className="flex-[2] btn-primary py-4 text-lg"
                >
                  {loading ? 'Processing...' : 'Complete Purchase'}
                </button>
              </div>
            </div>

            <div className="card bg-neutral-900 text-white p-8 h-fit shadow-2xl">
              <h3 className="text-xl font-bold mb-8">Summary</h3>
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="font-bold">PKR 210,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Shipping</span>
                  <span className="font-bold">PKR 500</span>
                </div>
                <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-2xl font-bold text-primary font-serif">PKR 210,500</span>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/10">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Encrypted Payment</span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center bg-white p-20 rounded-3xl shadow-premium max-w-2xl mx-auto border border-secondary-dark"
          >
            <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 text-green-600 rounded-full mb-10 shadow-lg shadow-green-100">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h2 className="text-4xl font-serif font-bold text-neutral-900 mb-4">Order Placed!</h2>
            <p className="text-gray-500 mb-12 text-lg">
              Thank you for shopping with ShaadiSahulat. Your order <span className="font-bold text-neutral-900">#SS-92810</span> is being processed.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => navigate('/order-tracking')} className="btn-primary py-4">Track Order</button>
              <button onClick={() => navigate('/home')} className="btn-secondary py-4 bg-white">Back to Marketplace</button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Checkout;

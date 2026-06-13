import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, ShoppingBag, ArrowRight, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Cart = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([
    { id: 1, name: 'Premium Sofa Set', price: 125000, quantity: 1, image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200' },
    { id: 2, name: 'Bridal Lehenga', price: 85000, quantity: 1, image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=200' },
  ]);

  const updateQuantity = (id, delta) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id));
    toast.error('Item removed from cart');
  };

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = 500;
  const total = subtotal + shipping;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-8">
          <ShoppingBag className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-serif font-bold text-neutral-900 mb-2">Your cart is empty</h2>
        <p className="text-gray-500 mb-10 text-center max-w-xs">Looks like you haven't added anything to your cart yet.</p>
        <Link to="/home" className="btn-primary px-10 py-3">Start Shopping</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-light py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-serif font-bold text-neutral-900 mb-12">Shopping Cart</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Item List */}
          <div className="lg:col-span-2 space-y-6">
            <AnimatePresence>
              {items.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="card bg-white p-6 flex flex-col sm:flex-row items-center gap-8 relative"
                >
                  <div className="w-32 h-32 rounded-2xl overflow-hidden bg-gray-50 flex-shrink-0">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="text-xl font-bold text-neutral-900 mb-2">{item.name}</h3>
                    <p className="text-sm text-gray-400 mb-4 font-medium uppercase tracking-widest">Furniture & Apparel</p>
                    <div className="flex items-center justify-center sm:justify-start space-x-6">
                      <div className="flex items-center border border-gray-100 rounded-lg overflow-hidden">
                        <button onClick={() => updateQuantity(item.id, -1)} className="p-2 hover:bg-gray-50 text-gray-500"><Minus className="w-4 h-4" /></button>
                        <span className="px-4 font-bold text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="p-2 hover:bg-gray-50 text-gray-500"><Plus className="w-4 h-4" /></button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-accent transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-center sm:text-right">
                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">Price</p>
                    <p className="text-2xl font-bold text-neutral-900">PKR {(item.price * item.quantity).toLocaleString()}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="flex items-center space-x-4 p-6 bg-white/50 rounded-2xl border border-dashed border-gray-200">
              <Truck className="w-6 h-6 text-primary" />
              <p className="text-sm text-gray-500 italic">Add <span className="font-bold text-primary">PKR 15,000</span> more to your cart for <span className="font-bold">Priority Shipping</span>.</p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-8">
            <div className="card bg-white p-8 shadow-premium">
              <h2 className="text-xl font-bold mb-8">Order Summary</h2>
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-bold text-neutral-900 font-serif">PKR {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Shipping</span>
                  <span className="font-bold text-neutral-900 font-serif">PKR {shipping.toLocaleString()}</span>
                </div>
                <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-3xl font-bold text-primary font-serif">PKR {total.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => navigate('/checkout')}
                  className="w-full btn-primary py-4 flex items-center justify-center space-x-2 text-lg"
                >
                  <span>Checkout Now</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
                <div className="flex items-center justify-center space-x-2 py-4 text-xs text-gray-400 font-bold uppercase tracking-widest border-y border-gray-50 my-4">
                  <span className="h-px bg-gray-100 flex-1"></span>
                  <span>OR</span>
                  <span className="h-px bg-gray-100 flex-1"></span>
                </div>
                <button 
                  onClick={() => navigate('/bnpl')}
                  className="w-full btn-secondary bg-white py-4 border-2 border-primary text-primary hover:bg-secondary transition-all font-bold"
                >
                  Pay in Installments (BNPL)
                </button>
              </div>

              <div className="mt-8 flex items-center justify-center space-x-4">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">100% Secure Checkout</span>
              </div>
            </div>

            <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
              <h3 className="text-sm font-bold text-primary mb-2">Have a Promo Code?</h3>
              <div className="flex space-x-2">
                <input type="text" placeholder="GIFT20" className="input-field py-2 text-sm" />
                <button className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold">Apply</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;

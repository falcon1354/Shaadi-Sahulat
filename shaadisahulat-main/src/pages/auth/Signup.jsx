import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Lock, ArrowRight, ShoppingBag, Store } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Signup = () => {
  const [role, setRole] = useState('buyer');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }

    setLoading(true);
    // Mock signup
    setTimeout(() => {
      toast.success('Account created successfully!');
      navigate('/login');
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-secondary-light px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <div className="bg-white p-10 rounded-2xl shadow-premium border border-secondary-dark flex flex-col md:flex-row gap-12">
          {/* Left Side: Role Selection & Info */}
          <div className="md:w-5/12 border-r border-gray-100 pr-0 md:pr-12">
            <h1 className="text-3xl font-serif font-bold text-neutral-900 mb-4">Join Us</h1>
            <p className="text-gray-500 text-sm mb-8">Choose your role and start your journey with ShaadiSahulat.</p>
            
            <div className="space-y-4">
              <div 
                onClick={() => setRole('buyer')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${role === 'buyer' ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-primary/30'}`}
              >
                <div className="flex items-center space-x-3 mb-1">
                  <ShoppingBag className={`w-5 h-5 ${role === 'buyer' ? 'text-primary' : 'text-gray-400'}`} />
                  <span className={`font-bold ${role === 'buyer' ? 'text-primary' : 'text-gray-700'}`}>Buyer</span>
                </div>
                <p className="text-[11px] text-gray-400">Shopping for wedding & home essentials</p>
              </div>

              <div 
                onClick={() => setRole('seller')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${role === 'seller' ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-primary/30'}`}
              >
                <div className="flex items-center space-x-3 mb-1">
                  <Store className={`w-5 h-5 ${role === 'seller' ? 'text-primary' : 'text-gray-400'}`} />
                  <span className={`font-bold ${role === 'seller' ? 'text-primary' : 'text-gray-700'}`}>Seller</span>
                </div>
                <p className="text-[11px] text-gray-400">Listing products and managing orders</p>
              </div>
            </div>

            <div className="mt-12 hidden md:block">
              <div className="p-4 bg-secondary-light rounded-lg">
                <p className="text-xs italic text-gray-500 leading-relaxed">
                  "The simplest way to manage your wedding expenses and find everything you need in one place."
                </p>
              </div>
            </div>
          </div>

          {/* Right Side: Form */}
          <div className="md:w-7/12">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    className="input-field pl-11"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <User className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    className="input-field pl-11"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                  <Mail className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Phone Number</label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    className="input-field pl-11"
                    placeholder="+92 XXX XXXXXXX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <Phone className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Password</label>
                  <input
                    type="password"
                    required
                    className="input-field"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Confirm</label>
                  <input
                    type="password"
                    required
                    className="input-field"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-4 flex items-center justify-center space-x-2 text-lg disabled:opacity-70 mt-4"
              >
                <span>{loading ? 'Creating Account...' : 'Sign Up'}</span>
                {!loading && <ArrowRight className="w-5 h-5" />}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-primary font-bold hover:underline">Sign In</Link>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;

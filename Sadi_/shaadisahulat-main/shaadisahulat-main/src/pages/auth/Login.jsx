import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Mock login logic
    setTimeout(() => {
      if (formData.email && formData.password) {
        // Mock role detection based on email for testing
        let role = 'buyer';
        if (formData.email.includes('seller')) role = 'seller';
        if (formData.email.includes('admin')) role = 'admin';

        login({
          id: '1',
          name: formData.email.split('@')[0],
          email: formData.email,
          role: role
        });

        toast.success(`Welcome back, ${formData.email.split('@')[0]}!`);
        
        if (role === 'seller') navigate('/seller/dashboard');
        else if (role === 'admin') navigate('/admin/dashboard');
        else navigate('/home');
      } else {
        toast.error('Invalid credentials');
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-secondary-light px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-2xl shadow-premium border border-secondary-dark">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-serif font-bold text-neutral-900 mb-2">Welcome Back</h1>
            <p className="text-gray-500">Sign in to your ShaadiSahulat account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
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
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-700">Password</label>
                <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="input-field pl-11 pr-11"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <Lock className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3 text-gray-400 hover:text-primary"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-4 flex items-center justify-center space-x-2 text-lg disabled:opacity-70"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary font-bold hover:underline">Create an account</Link>
            </p>
          </div>
        </div>

        {/* Tip for testing */}
        <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10 text-center">
          <p className="text-[10px] text-primary-dark uppercase tracking-widest font-bold mb-1">Testing Credentials</p>
          <p className="text-xs text-gray-500 italic">Use 'seller@example.com' for seller dashboard or 'admin@example.com' for admin dashboard.</p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;

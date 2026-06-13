import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, User, Heart, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getNavLinks = () => {
    if (!user || user.role === 'buyer') {
      return [
        { label: 'Marketplace', path: '/home' },
        { label: 'Dowry Estimator', path: '/dowry-estimation' },
        { label: 'BNPL Plans', path: '/bnpl' },
        { label: 'My Spending', path: '/analytics' },
      ];
    }
    if (user.role === 'seller') {
      return [
        { label: 'Dashboard', path: '/seller/dashboard' },
        { label: 'Upload Product', path: '/seller/upload' },
        { label: 'Market Trends', path: '/seller/dashboard' },
      ];
    }
    if (user.role === 'admin') {
      return [
        { label: 'Dashboard', path: '/admin/dashboard' },
        { label: 'User Management', path: '/admin/users' },
        { label: 'Site Analytics', path: '/analytics' },
      ];
    }
    return [{ label: 'Marketplace', path: '/home' }];
  };

  const navLinks = getNavLinks();

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-secondary-dark px-4 md:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/home" className="flex items-center space-x-2">
          <span className="text-2xl font-serif font-bold text-primary">Shaadi<span className="text-accent">Sahulat</span></span>
        </Link>

        {/* Search Bar - Desktop */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <input 
              type="text" 
              placeholder={user?.role === 'seller' ? "Search your inventory..." : user?.role === 'admin' ? "Search users or orders..." : "Search wedding essentials..."} 
              className="w-full pl-10 pr-4 py-2 bg-neutral-100 border-none rounded-full focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
          </div>
        </div>

        {/* Navigation Links - Desktop */}
        <div className="hidden lg:flex items-center space-x-6 text-sm font-medium text-neutral-800">
          {navLinks.map(link => (
            <Link key={link.label} to={link.path} className="hover:text-primary transition-colors">{link.label}</Link>
          ))}
        </div>

        {/* Action Icons */}
        <div className="flex items-center space-x-4">
          {(!user || user.role === 'buyer') && (
            <Link to="/cart" className="relative p-2 text-neutral-800 hover:bg-secondary rounded-full transition-colors">
              <ShoppingCart className="w-6 h-6" />
              <span className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-1.5 rounded-full">2</span>
            </Link>
          )}
          
          {user ? (
            <div className="flex items-center space-x-3 ml-2">
              <button 
                onClick={() => navigate(user.role === 'seller' ? '/seller/dashboard' : user.role === 'admin' ? '/admin/dashboard' : '/home')}
                className="flex items-center space-x-2 p-1 pl-3 bg-secondary-light border border-secondary-dark rounded-full hover:shadow-sm transition-all"
              >
                <span className="hidden sm:block text-xs font-semibold text-neutral-800">{user.name}</span>
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold">
                  {user.name[0]}
                </div>
              </button>
              <button onClick={logout} className="hidden sm:block text-xs text-gray-500 hover:text-accent">Logout</button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary py-2 px-4 sm:px-6 text-sm flex items-center space-x-2">
              <User className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Login</span>
            </Link>
          )}

          <button 
            className="lg:hidden p-2 text-neutral-800"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 py-4 px-6 space-y-4 animate-in slide-in-from-top duration-300">
          {navLinks.map(link => (
            <Link 
              key={link.path} 
              to={link.path} 
              className="block text-lg font-medium text-neutral-800 hover:text-primary transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {!user && (
            <Link 
              to="/login" 
              className="block btn-primary text-center py-3"
              onClick={() => setIsMenuOpen(false)}
            >
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;

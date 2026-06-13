import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Share2, MessageSquare, Mail, Phone, MapPin } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-white border-t border-secondary-dark pt-16 pb-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        {/* Brand Info */}
        <div className="space-y-4">
          <h2 className="text-2xl font-serif font-bold text-primary">ShaadiSahulat</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Empowering families with stress-free wedding planning and affordable dowry solutions through our innovative marketplace and BNPL options.
          </p>
          <div className="flex space-x-4 pt-2">
            <Globe className="w-5 h-5 text-gray-400 hover:text-primary cursor-pointer transition-colors" />
            <Share2 className="w-5 h-5 text-gray-400 hover:text-primary cursor-pointer transition-colors" />
            <MessageSquare className="w-5 h-5 text-gray-400 hover:text-primary cursor-pointer transition-colors" />
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="text-lg font-serif font-semibold mb-6">Quick Links</h3>
          <ul className="space-y-4 text-sm text-gray-500">
            <li><Link to="/home" className="hover:text-primary transition-colors">Marketplace</Link></li>
            <li><Link to="/bnpl" className="hover:text-primary transition-colors">BNPL Installments</Link></li>
            <li><Link to="/analytics" className="hover:text-primary transition-colors">Budget Estimator</Link></li>
            <li><Link to="/seller/dashboard" className="hover:text-primary transition-colors">Sell with Us</Link></li>
          </ul>
        </div>

        {/* Support */}
        <div>
          <h3 className="text-lg font-serif font-semibold mb-6">Support</h3>
          <ul className="space-y-4 text-sm text-gray-500">
            <li><Link to="/about" className="hover:text-primary transition-colors">About Us</Link></li>
            <li><Link to="/contact" className="hover:text-primary transition-colors">Contact Support</Link></li>
            <li><Link to="/terms" className="hover:text-primary transition-colors">Terms & Conditions</Link></li>
            <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
          </ul>
        </div>

        {/* Contact Info */}
        <div>
          <h3 className="text-lg font-serif font-semibold mb-6">Get in Touch</h3>
          <ul className="space-y-4 text-sm text-gray-500">
            <li className="flex items-center space-x-3">
              <Mail className="w-4 h-4 text-primary" />
              <span>support@shaadisahulat.com</span>
            </li>
            <li className="flex items-center space-x-3">
              <Phone className="w-4 h-4 text-primary" />
              <span>+92 300 1234567</span>
            </li>
            <li className="flex items-center space-x-3">
              <MapPin className="w-4 h-4 text-primary" />
              <span>Lahore, Pakistan</span>
            </li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
        <p>© 2026 ShaadiSahulat. All rights reserved.</p>
        <div className="flex space-x-6 mt-4 md:mt-0">
          <span>Made with ♥ for your special day</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

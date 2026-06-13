import React, { useState } from 'react';
import { Filter, Star, ChevronRight, Sparkles, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import PRODUCTS_DATA from '../../data/products.json';

const Home = () => {
  const [activeCategory, setActiveCategory] = useState('All');
  const navigate = useNavigate();
  
  const categories = ['All', 'Apparel', 'Home Decor', 'Furniture', 'Electronics', 'Kitchenware'];

  const filteredProducts = activeCategory === 'All' 
    ? PRODUCTS_DATA 
    : PRODUCTS_DATA.filter(p => p.category === activeCategory);

  return (
    <div className="pb-20">
      {/* Hero Section */}
      <section className="relative h-[500px] flex items-center justify-center bg-secondary-light overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-[-10%] left-[-5%] w-[300px] h-[300px] bg-accent/5 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-flex items-center space-x-2 px-3 py-1 bg-white rounded-full text-xs font-bold text-primary mb-6 shadow-sm">
              <Sparkles className="w-3 h-3" />
              <span>TRANSFORMING TRADITION WITH EASE</span>
            </span>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 text-neutral-900">
              Your Dream Wedding, <br />
              <span className="text-primary italic">Simplified.</span>
            </h1>
            <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Discover premium bridal wear, premium electronics, and home essentials with flexible payment plans tailored for your special journey.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <button className="btn-primary px-10 py-4 text-lg">Start Shopping</button>
              <button 
                onClick={() => navigate('/dowry-estimation')}
                className="btn-secondary px-10 py-4 text-lg bg-white"
              >
                Estimate Dowry
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Marketplace Section */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold text-neutral-900 mb-2">Marketplace Essentials</h2>
            <p className="text-gray-500">Handpicked items for your perfect home and ceremony</p>
          </div>
          
          <div className="flex items-center space-x-4 mt-6 md:mt-0 max-w-full">
            <div className="flex items-center space-x-2 bg-white border border-gray-100 rounded-lg p-1 shadow-sm overflow-x-auto no-scrollbar max-w-[calc(100vw-32px)] md:max-w-none whitespace-nowrap">
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeCategory === cat ? 'bg-primary text-white' : 'text-gray-500 hover:text-primary'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button className="p-2.5 bg-white border border-gray-100 rounded-lg shadow-sm hover:text-primary transition-colors">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProducts.map((product, idx) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              viewport={{ once: true }}
              className="group"
            >
              <div className="card p-0 overflow-hidden relative border-none shadow-premium/5 hover:shadow-premium transition-all duration-500">
                <div className="relative h-72 overflow-hidden">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-sm">
                    <Heart className="w-5 h-5 text-gray-400 hover:text-accent cursor-pointer transition-colors" />
                  </div>
                  {idx === 0 && (
                    <div className="absolute top-4 left-4 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">
                      Best Seller
                    </div>
                  )}
                </div>
                
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">{product.category}</span>
                    <div className="flex items-center text-xs font-bold text-gray-600 bg-secondary-light px-2 py-1 rounded">
                      <Star className="w-3 h-3 text-primary fill-primary mr-1" />
                      {product.rating}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900 group-hover:text-primary transition-colors mb-3">{product.name}</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Starting from</p>
                      <p className="text-xl font-bold text-neutral-900">PKR {product.price.toLocaleString()}</p>
                    </div>
                    <button className="p-3 bg-secondary-light text-primary rounded-full group-hover:bg-primary group-hover:text-white transition-all duration-300">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* AI Recommendations Section Placeholder */}
        <section className="mt-32 p-12 bg-neutral-900 rounded-3xl relative overflow-hidden text-white">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px]"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="max-w-xl text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start space-x-2 text-primary mb-4">
                <Sparkles className="w-5 h-5" />
                <span className="text-sm font-bold tracking-widest uppercase">Smart Assistant</span>
              </div>
              <h2 className="text-4xl font-bold mb-6">AI-Powered Recommendations</h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                Tell us about your preferences and budget, and our machine learning algorithm will curate the perfect dowry package for you.
              </p>
              <button className="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition-all shadow-lg shadow-primary/20">
                Get Personalized Picks
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm group hover:border-primary/50 transition-colors">
                  <div className="w-20 h-2 md:w-24 md:h-3 bg-white/10 rounded-full group-hover:bg-primary/20 transition-colors"></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;

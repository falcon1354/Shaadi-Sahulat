import React from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, ShoppingBag, PlusCircle, Settings, Users, DollarSign, Package, TrendingUp, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const SellerDashboard = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Desktop */}
      <aside className="w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col p-6 space-y-8 sticky top-20 h-[calc(100vh-80px)]">
        <div className="space-y-1">
          {[
            { label: 'Dashboard', icon: LayoutDashboard, active: true, path: '/seller/dashboard' },
            { label: 'Upload Product', icon: PlusCircle, active: false, path: '/seller/upload' },
            { label: 'My Orders', icon: ShoppingBag, active: false, path: '/seller/orders' },
            { label: 'Customers', icon: Users, active: false, path: '#' },
            { label: 'Settings', icon: Settings, active: false, path: '#' },
          ].map((item) => (
            <Link 
              key={item.label}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${item.active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:bg-secondary-light hover:text-primary'}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="mt-auto p-4 bg-secondary-light rounded-2xl border border-secondary-dark">
          <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Seller Tip</p>
          <p className="text-[10px] text-gray-500 leading-relaxed">Add high-quality photos to increase sales by up to 40%.</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <header className="flex justify-between items-center mb-10">
            <div>
              <h1 className="text-3xl font-serif font-bold text-neutral-900">Seller Dashboard</h1>
              <p className="text-gray-500 text-sm">Welcome back! Here's what's happening with your store today.</p>
            </div>
            <Link to="/seller/upload" className="btn-primary flex items-center space-x-2">
              <PlusCircle className="w-5 h-5" />
              <span>Add New Product</span>
            </Link>
          </header>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              { label: 'Total Sales', value: 'PKR 1.2M', icon: DollarSign, color: 'bg-green-50 text-green-600' },
              { label: 'Active Listings', value: '24', icon: Package, color: 'bg-blue-50 text-blue-600' },
              { label: 'Orders to Ship', value: '08', icon: TrendingUp, color: 'bg-orange-50 text-orange-600' },
            ].map((stat, i) => (
              <motion.div 
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="card bg-white p-8 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <h3 className="text-3xl font-bold text-neutral-900">{stat.value}</h3>
                </div>
                <div className={`p-4 rounded-2xl ${stat.color}`}>
                  <stat.icon className="w-8 h-8" />
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Orders */}
            <div className="card bg-white p-8 overflow-hidden">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold">Recent Orders</h2>
                <button className="text-primary text-sm font-bold hover:underline">View All</button>
              </div>
              <div className="space-y-6">
                {[
                  { id: '#8829', customer: 'Ahmad Hassan', price: '125,000', status: 'Processing' },
                  { id: '#8828', customer: 'Sarah Khan', price: '45,000', status: 'Shipped' },
                  { id: '#8827', customer: 'Zainab Ali', price: '85,000', status: 'Delivered' },
                ].map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500 text-xs">
                        {order.customer[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">{order.customer}</p>
                        <p className="text-[10px] text-gray-400">Order {order.id}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-neutral-900">PKR {order.price}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${order.status === 'Processing' ? 'bg-yellow-50 text-yellow-600' : order.status === 'Shipped' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions / Tips */}
            <div className="space-y-8">
              <div className="card bg-primary text-white p-8 relative overflow-hidden">
                <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                <h2 className="text-2xl font-bold mb-4">Grow Your Store</h2>
                <p className="text-sm text-white/80 mb-8 leading-relaxed">
                  Join our "Premium Seller" program to get 20% lower commission and featured placement in AI recommendations.
                </p>
                <button className="bg-white text-primary px-6 py-3 rounded-xl font-bold text-sm hover:shadow-lg transition-all">Upgrade Account</button>
              </div>

              <div className="card bg-white p-8">
                <h2 className="text-xl font-bold mb-6">Market Trends</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Popular Category</span>
                    <span className="font-bold text-primary">Bridal Apparel</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Price Trend</span>
                    <span className="text-green-500 font-bold flex items-center">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      +4.2%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-6">My Products</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {(() => {
                const products = JSON.parse(localStorage.getItem('seller_products') || '[]');
                if (products.length === 0) return <p className="text-gray-400 text-sm italic col-span-full">No products uploaded yet.</p>;
                return products.map((p) => (
                  <div key={p.id} className="card bg-white p-4 flex flex-col">
                    <img src={p.images[0]} alt={p.title} className="w-full h-32 object-cover rounded-xl mb-4" />
                    <h3 className="font-bold text-sm truncate mb-1">{p.title}</h3>
                    <p className="text-primary font-bold text-sm">PKR {parseFloat(p.price).toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase font-bold tracking-widest">{p.category}</p>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SellerDashboard;

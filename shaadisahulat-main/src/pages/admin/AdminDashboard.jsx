import React from 'react';
import { motion } from 'framer-motion';
import { Users, ShoppingBag, ShieldAlert, CreditCard, Activity, Search, Filter, MoreVertical, Ban, CheckCircle, XCircle } from 'lucide-react';

const AdminDashboard = () => {
  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Sidebar - Desktop */}
      <aside className="w-64 bg-neutral-900 flex flex-col p-6 space-y-8 sticky top-0 h-screen hidden lg:flex">
        <div className="mb-4">
          <span className="text-2xl font-serif font-bold text-primary">Shaadi<span className="text-white">Sahulat</span></span>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Admin Control Center</p>
        </div>

        <div className="space-y-1">
          {[
            { label: 'Overview', icon: Activity, active: true },
            { label: 'Users', icon: Users, active: false },
            { label: 'Payments', icon: CreditCard, active: false },
            { label: 'Disputes', icon: ShieldAlert, active: false },
          ].map((item) => (
            <button 
              key={item.label}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${item.active ? 'bg-primary text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-2">System Status</p>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-white font-medium">All systems normal</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">Platform Overview</h1>
              <p className="text-gray-500 text-sm">Managing the ecosystem for 2.4k users today.</p>
            </div>
            
            <div className="flex items-center space-x-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <input type="text" placeholder="Global search..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all" />
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              </div>
              <button className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-primary transition-colors">
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {[
              { label: 'Active Users', value: '2,482', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
              { label: 'Monthly Volume', value: 'Rs. 4.2M', icon: CreditCard, color: 'text-green-500', bg: 'bg-green-50' },
              { label: 'Pending BNPL', value: '18', icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-50' },
              { label: 'New Orders', value: '142', icon: ShoppingBag, color: 'text-primary', bg: 'bg-secondary' },
            ].map((stat, i) => (
              <motion.div 
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <MoreVertical className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <h3 className="text-2xl font-bold text-neutral-900">{stat.value}</h3>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* User Management Quick View */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                <h2 className="text-xl font-bold">Recent Registrations</h2>
                <button className="text-sm font-bold text-primary">View All Users</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-widest">
                    <tr>
                      <th className="px-8 py-4">User</th>
                      <th className="px-8 py-4">Role</th>
                      <th className="px-8 py-4">Join Date</th>
                      <th className="px-8 py-4">Status</th>
                      <th className="px-8 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      { name: 'Ahmad Hassan', email: 'ahmad@example.com', role: 'Buyer', date: 'May 01, 2026', status: 'Active' },
                      { name: 'Royal Jewelers', email: 'royal@shop.com', role: 'Seller', date: 'Apr 28, 2026', status: 'Active' },
                      { name: 'Sarah Khan', email: 'sarah@example.com', role: 'Buyer', date: 'Apr 25, 2026', status: 'Suspended' },
                    ].map((user, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-primary font-bold text-xs">
                              {user.name[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-900">{user.name}</p>
                              <p className="text-xs text-gray-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${user.role === 'Seller' ? 'text-primary bg-secondary' : 'text-blue-600 bg-blue-50'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-sm text-gray-500">{user.date}</td>
                        <td className="px-8 py-5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${user.status === 'Active' ? 'text-green-600 bg-green-50' : 'text-accent bg-accent/5'}`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end space-x-2">
                            <button className="p-1.5 text-gray-400 hover:text-primary transition-colors"><CheckCircle className="w-4 h-4" /></button>
                            <button className="p-1.5 text-gray-400 hover:text-accent transition-colors"><Ban className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pending BNPL Requests */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
              <h2 className="text-xl font-bold mb-8">BNPL Approvals</h2>
              <div className="space-y-6">
                {[1, 2, 3].map((req) => (
                  <div key={req} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                          <CreditCard className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-neutral-900">Zainab Ali</p>
                          <p className="text-[10px] text-gray-400">May 01 • Rs. 85,000</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-600 rounded">Pending</span>
                    </div>
                    <div className="flex space-x-2 mt-4">
                      <button className="flex-1 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all">Approve</button>
                      <button className="flex-1 py-2 bg-white text-gray-400 border border-gray-200 rounded-lg text-xs font-bold hover:text-accent transition-all">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;

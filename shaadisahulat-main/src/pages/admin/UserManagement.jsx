import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, MoreVertical, Ban, CheckCircle, XCircle, UserPlus, Mail, Shield, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([
    { id: 1, name: 'Ahmad Hassan', email: 'ahmad@example.com', role: 'Buyer', date: 'May 01, 2026', status: 'Active' },
    { id: 2, name: 'Royal Jewelers', email: 'royal@shop.com', role: 'Seller', date: 'Apr 28, 2026', status: 'Active' },
    { id: 3, name: 'Sarah Khan', email: 'sarah@example.com', role: 'Buyer', date: 'Apr 25, 2026', status: 'Suspended' },
    { id: 4, name: 'Zainab Ali', email: 'zainab@example.com', role: 'Buyer', date: 'Apr 20, 2026', status: 'Active' },
    { id: 5, name: 'Elite Furniture', email: 'elite@shop.com', role: 'Seller', date: 'Apr 15, 2026', status: 'Active' },
  ]);

  const toggleStatus = (id) => {
    setUsers(users.map(u => {
      if (u.id === id) {
        const newStatus = u.status === 'Active' ? 'Suspended' : 'Active';
        toast.success(`User status updated to ${newStatus}`);
        return { ...u, status: newStatus };
      }
      return u;
    }));
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">User Management</h1>
            <p className="text-gray-500 text-sm">Search, monitor, and manage roles for all platform users.</p>
          </div>
          <button className="btn-primary flex items-center space-x-2">
            <UserPlus className="w-5 h-5" />
            <span>Add Internal User</span>
          </button>
        </header>

        {/* Filter & Search Bar */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-10 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" />
          </div>
          <div className="flex gap-4">
            <select className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold text-gray-500 outline-none focus:ring-2 focus:ring-primary/10">
              <option>All Roles</option>
              <option>Buyers</option>
              <option>Sellers</option>
              <option>Admins</option>
            </select>
            <button className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-400 hover:text-primary transition-colors">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-premium overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-widest">
                <tr>
                  <th className="px-8 py-5">User Details</th>
                  <th className="px-8 py-5">Role & ID</th>
                  <th className="px-8 py-5">Joined</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map((user, i) => (
                  <motion.tr 
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary font-bold shadow-sm">
                          {user.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{user.name}</p>
                          <div className="flex items-center space-x-2 text-xs text-gray-400 mt-0.5">
                            <Mail className="w-3 h-3" />
                            <span>{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${user.role === 'Seller' ? 'text-primary bg-secondary' : 'text-blue-600 bg-blue-50'}`}>
                          {user.role}
                        </span>
                        <p className="text-[10px] text-gray-300 font-mono">ID: {2000 + user.id}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm text-gray-500">{user.date}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">via Email Signup</p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-accent'}`}></div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${user.status === 'Active' ? 'text-green-600' : 'text-accent'}`}>
                          {user.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end space-x-1">
                        <button className="p-2 text-gray-400 hover:text-primary hover:bg-secondary rounded-lg transition-all" title="View Profile">
                          <User className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => toggleStatus(user.id)}
                          className={`p-2 rounded-lg transition-all ${user.status === 'Active' ? 'text-gray-400 hover:text-accent hover:bg-accent/5' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                          title={user.status === 'Active' ? 'Suspend User' : 'Reactivate User'}
                        >
                          {user.status === 'Active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        <button className="p-2 text-gray-400 hover:text-neutral-900 rounded-lg transition-all" title="More Options">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="p-20 text-center">
              <p className="text-gray-400 font-medium italic">No users found matching your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;

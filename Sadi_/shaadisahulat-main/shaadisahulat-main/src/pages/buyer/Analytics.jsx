import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, AlertCircle, ShoppingBag, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const BUDGET_DATA = [
  { name: 'Spent', value: 450000, color: '#C21E56' },
  { name: 'Remaining', value: 150000, color: '#D4AF37' },
];

const CATEGORY_DATA = [
  { name: 'Electronics', spent: 250000, budget: 200000 },
  { name: 'Apparel', spent: 120000, budget: 150000 },
  { name: 'Furniture', spent: 50000, budget: 150000 },
  { name: 'Other', spent: 30000, budget: 100000 },
];

const Analytics = () => {
  const [selectedCategory, setSelectedCategory] = useState(null);

  return (
    <div className="min-h-screen bg-secondary-light py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-4xl font-serif font-bold text-neutral-900 mb-2">Spending Analytics</h1>
            <p className="text-gray-500">Track your wedding budget and manage expenses effectively.</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-3">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Total Budget</span>
            <span className="text-xl font-bold text-primary font-serif">PKR 600,000</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {[
            { label: 'Total Spent', value: '450,000', icon: DollarSign, trend: '+12%', up: true },
            { label: 'Active Orders', value: '03', icon: ShoppingBag, trend: '+1', up: true },
            { label: 'Overspent In', value: 'Electronics', icon: AlertCircle, trend: 'Warning', up: false },
            { label: 'Saved', value: '150,000', icon: TrendingUp, trend: '25%', up: true },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="card bg-white p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-secondary rounded-xl text-primary">
                  <stat.icon className="w-6 h-6" />
                </div>
                <div className={`flex items-center text-xs font-bold ${stat.up ? 'text-green-500' : 'text-accent'}`}>
                  {stat.up ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                  {stat.trend}
                </div>
              </div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-neutral-900">PKR {stat.value}</h3>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
          {/* Pie Chart: Budget vs Spending */}
          <div className="card bg-white p-4 md:p-8 shadow-premium">
            <h2 className="text-xl font-bold mb-8">Budget vs. Actual Spending</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={BUDGET_DATA}
                    innerRadius={80}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {BUDGET_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">You have used <span className="font-bold text-neutral-900">75%</span> of your allocated budget.</p>
            </div>
          </div>

          {/* Bar Chart: Category Breakdown */}
          <div className="card bg-white p-4 md:p-8 shadow-premium">
            <h2 className="text-xl font-bold mb-8">Category Comparison</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={CATEGORY_DATA} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value/1000}k`} />
                  <Tooltip cursor={{fill: '#fcf8fa'}} />
                  <Legend />
                  <Bar dataKey="budget" fill="#D4AF37" radius={[4, 4, 0, 0]} name="Budgeted" />
                  <Bar dataKey="spent" fill="#C21E56" radius={[4, 4, 0, 0]} name="Actual Spent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="bg-accent/5 border border-accent/20 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center space-x-6 mb-6 md:mb-0">
            <div className="w-16 h-16 bg-accent text-white rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-accent">Overspending Alert!</h3>
              <p className="text-sm text-gray-600">Your spending in <span className="font-bold">Electronics</span> has exceeded the budget by <span className="font-bold">PKR 50,000</span>.</p>
            </div>
          </div>
          <button className="btn-primary bg-accent hover:bg-accent/90 border-none px-8 py-3">View Details</button>
        </div>
      </div>
    </div>
  );
};

export default Analytics;

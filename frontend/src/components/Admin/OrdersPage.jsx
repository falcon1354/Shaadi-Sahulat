import React, { useState } from 'react';

const STATUS_CONFIG = {
  'Order Placed':        { color: 'bg-blue-100 text-blue-700 border-blue-200',    dot: 'bg-blue-500'   },
  'Payment Confirmed':   { color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  'Processing':          { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  'Shipped':             { color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  'Out for Delivery':    { color: 'bg-teal-100 text-teal-700 border-teal-200',    dot: 'bg-teal-500'   },
  'Delivered':           { color: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500'  },
  'Cancelled':           { color: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500'    },
  'Return Requested':    { color: 'bg-pink-100 text-pink-700 border-pink-200',    dot: 'bg-pink-500'   },
};

const STATUSES = Object.keys(STATUS_CONFIG);

const DUMMY_ORDERS = [
  { id: 'ORD-001', buyer: 'Ayesha Khan',    seller: 'Ahmed Traders', product: 'Deep Red Bridal Lehenga',          price: 75000, date: '2026-06-10', status: 'Delivered'         },
  { id: 'ORD-002', buyer: 'Sana Malik',     seller: 'Ahmed Traders', product: 'King Size Dark Walnut Panel Bed',  price: 120000,date: '2026-06-11', status: 'Shipped'           },
  { id: 'ORD-003', buyer: 'Fatima Raza',    seller: 'Ahmed Traders', product: 'Samsung 43-inch Smart LED TV',     price: 75000, date: '2026-06-11', status: 'Processing'        },
  { id: 'ORD-004', buyer: 'Nadia Hussain',  seller: 'Ahmed Traders', product: 'Gold Ivory Bridal Sharara',        price: 55000, date: '2026-06-12', status: 'Payment Confirmed' },
  { id: 'ORD-005', buyer: 'Zara Ahmed',     seller: 'Ahmed Traders', product: 'Bone China Crockery Set 72-Piece', price: 18000, date: '2026-06-12', status: 'Order Placed'      },
  { id: 'ORD-006', buyer: 'Hira Baig',      seller: 'Ahmed Traders', product: 'Dawlance 8kg Washing Machine',    price: 55000, date: '2026-06-12', status: 'Out for Delivery'  },
  { id: 'ORD-007', buyer: 'Maria Sultan',   seller: 'Ahmed Traders', product: 'Stage Backdrop Frame Gold Ivory',  price: 25000, date: '2026-06-09', status: 'Cancelled'         },
  { id: 'ORD-008', buyer: 'Amna Tariq',     seller: 'Ahmed Traders', product: 'White Dressing Table Full Mirror', price: 22000, date: '2026-06-08', status: 'Return Requested'  },
  { id: 'ORD-009', buyer: 'Rabia Noor',     seller: 'Ahmed Traders', product: 'Haier 14 Cu.Ft Refrigerator',     price: 85000, date: '2026-06-13', status: 'Order Placed'      },
  { id: 'ORD-010', buyer: 'Sadia Khalid',   seller: 'Ahmed Traders', product: 'Silk Bridal Saree Embroidered',   price: 48000, date: '2026-06-13', status: 'Processing'        },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState(DUMMY_ORDERS);
  const [filter, setFilter] = useState('');

  const filtered = filter ? orders.filter(o => o.status === filter) : orders;

  const changeStatus = (id, newStatus) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const stats = STATUSES.map(s => ({ status: s, count: orders.filter(o => o.status === s).length }))
    .filter(s => s.count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
        <p className="text-sm text-gray-500 mt-1">Track and manage all customer orders</p>
      </div>

      {/* Status summary chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
            !filter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}
        >
          All ({orders.length})
        </button>
        {stats.map(({ status, count }) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <button
              key={status}
              onClick={() => setFilter(filter === status ? '' : status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                filter === status ? cfg.color + ' font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {status} ({count})
            </button>
          );
        })}
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Order ID', 'Buyer', 'Product', 'Price', 'Date', 'Status', 'Action'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(order => {
              const cfg = STATUS_CONFIG[order.status];
              return (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{order.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{order.buyer}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{order.product}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">PKR {order.price.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{order.date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={order.status}
                      onChange={e => changeStatus(order.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none"
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No orders with this status.</div>
        )}
      </div>
    </div>
  );
}

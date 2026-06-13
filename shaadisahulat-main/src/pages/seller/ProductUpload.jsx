import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, CheckCircle, Info, DollarSign, Package, Tag, Type, PlusCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const ProductUpload = () => {
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    price: '',
    stock: '',
  });
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    // In a real app, you'd create object URLs or upload to cloud
    const newImages = files.map(file => URL.createObjectURL(file));
    setImages([...images, ...newImages]);
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (images.length === 0) return toast.error('Please upload at least one image');
    
    setLoading(true);
    
    // Mock upload with localStorage persistence
    const newProduct = {
      ...formData,
      id: Date.now(),
      images,
      rating: 5.0,
      reviews: 0,
      createdAt: new Date().toISOString()
    };

    const existingProducts = JSON.parse(localStorage.getItem('seller_products') || '[]');
    localStorage.setItem('seller_products', JSON.stringify([newProduct, ...existingProducts]));

    setTimeout(() => {
      toast.success('Product listed successfully!');
      navigate('/seller/dashboard');
      setLoading(false);
    }, 1500);
  };

  // Dynamic validation logic placeholder
  const getPriceValidation = () => {
    const p = parseFloat(formData.price);
    if (!p) return null;
    if (p > 500000) return { message: 'Price seems very high for this category.', color: 'text-orange-500' };
    if (p < 500) return { message: 'Price seems low. Ensure it includes all costs.', color: 'text-blue-500' };
    return { message: 'Price is within acceptable range.', color: 'text-green-500' };
  };

  const validation = getPriceValidation();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-serif font-bold text-neutral-900 mb-2">Upload New Product</h1>
            <p className="text-gray-500 text-sm">Fill in the details to list your product on the marketplace.</p>
          </div>
          <button onClick={() => navigate(-1)} className="text-sm font-bold text-gray-400 hover:text-primary transition-colors">Cancel</button>
        </header>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left: General Info */}
          <div className="lg:col-span-2 space-y-8">
            <div className="card bg-white p-8 space-y-6">
              <h2 className="text-xl font-bold flex items-center space-x-2">
                <Type className="w-5 h-5 text-primary" />
                <span>Basic Information</span>
              </h2>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Product Title</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Handmade Silk Wedding Dress"
                  className="input-field"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
                  <select 
                    required
                    className="input-field"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                  >
                    <option value="">Select Category</option>
                    <option value="apparel">Apparel</option>
                    <option value="furniture">Furniture</option>
                    <option value="electronics">Electronics</option>
                    <option value="kitchenware">Kitchenware</option>
                    <option value="home">Home Decor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Quantity</label>
                  <input 
                    type="number" 
                    required
                    placeholder="e.g. 10"
                    className="input-field"
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea 
                  required
                  rows="5"
                  placeholder="Tell buyers about your product's materials, craftsmanship, and story..."
                  className="input-field resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                ></textarea>
              </div>
            </div>

            <div className="card bg-white p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center space-x-2">
                <Upload className="w-5 h-5 text-primary" />
                <span>Product Images</span>
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group">
                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-2 right-2 p-1 bg-white/90 rounded-full text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                {images.length < 4 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-gray-50">
                    <PlusCircle className="w-8 h-8 text-gray-300" />
                    <span className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Add Photo</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-4 italic">You can upload up to 4 high-quality photos.</p>
            </div>
          </div>

          {/* Right: Pricing & Meta */}
          <div className="space-y-8">
            <div className="card bg-white p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span>Pricing</span>
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Base Price (PKR)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      required
                      placeholder="0.00"
                      className="input-field pl-12"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                    />
                    <span className="absolute left-4 top-2.5 font-bold text-gray-400">Rs.</span>
                  </div>
                  {validation && (
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-[10px] font-bold mt-2 flex items-center ${validation.color}`}
                    >
                      <Info className="w-3 h-3 mr-1" />
                      {validation.message}
                    </motion.p>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-50 mt-6">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-gray-500">Service Fee (5%)</span>
                    <span className="text-gray-900 font-bold">Rs. {(parseFloat(formData.price || 0) * 0.05).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-50">
                    <span className="text-gray-900 font-bold">You Earn:</span>
                    <span className="text-primary font-bold">Rs. {(parseFloat(formData.price || 0) * 0.95).toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full btn-primary py-4 flex items-center justify-center space-x-2 text-lg shadow-xl shadow-primary/20"
              >
                <span>{loading ? 'Processing...' : 'Publish Product'}</span>
                {!loading && <CheckCircle className="w-5 h-5" />}
              </button>
              <p className="text-[10px] text-center text-gray-400 px-4">
                By publishing, you agree to ShaadiSahulat's Seller Terms and Quality Standards.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductUpload;

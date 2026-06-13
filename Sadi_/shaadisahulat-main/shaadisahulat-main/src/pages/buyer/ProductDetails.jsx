import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, ShoppingCart, Heart, Share2, ShieldCheck, Truck, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ProductDetails = () => {
  const { id } = useParams();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  // Mock product data
  const product = {
    id: id,
    name: 'Royal Velvet 7-Seater Sofa Set',
    price: 185000,
    rating: 4.9,
    reviews: 42,
    description: 'This premium sofa set is crafted with solid mahogany wood and high-density foam, upholstered in stain-resistant velvet. Perfect for adding a touch of elegance to your new home.',
    seller: { name: 'Interwood Furnishings', rating: 4.8, since: '2021' },
    images: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&auto=format',
      'https://images.unsplash.com/photo-1550581190-9c1c48d21d6c?w=800&auto=format',
      'https://images.unsplash.com/photo-1583847268964-b28dc2f51ac9?w=800&auto=format'
    ],
    details: [
      { label: 'Material', value: 'Mahogany Wood & Velvet' },
      { label: 'Seating Capacity', value: '7 Persons' },
      { label: 'Color', value: 'Royal Blue' },
      { label: 'Warranty', value: '5 Years' }
    ]
  };

  const addToCart = () => {
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <div className="bg-white pb-20">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-10">
        {/* Breadcrumbs */}
        <div className="flex items-center space-x-2 text-sm text-gray-400 mb-10">
          <Link to="/home" className="hover:text-primary transition-colors">Marketplace</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-600 font-medium">Furniture</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Image Gallery */}
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="aspect-square rounded-3xl overflow-hidden bg-gray-50 border border-secondary-dark"
            >
              <img 
                src={product.images[selectedImage]} 
                alt={product.name} 
                className="w-full h-full object-cover"
              />
            </motion.div>
            <div className="grid grid-cols-3 gap-4">
              {product.images.map((img, idx) => (
                <button 
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedImage === idx ? 'border-primary' : 'border-transparent opacity-60'}`}
                >
                  <img src={img} alt="thumbnail" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Product Info */}
          <div className="flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="inline-block px-3 py-1 bg-secondary text-primary text-xs font-bold rounded-full mb-4 uppercase tracking-widest">Bridal Collection</span>
                <h1 className="text-4xl font-bold text-neutral-900 mb-2">{product.name}</h1>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= 4 ? 'text-primary fill-primary' : 'text-gray-200'}`} />
                    ))}
                    <span className="text-sm font-bold text-gray-700 ml-2">{product.rating}</span>
                  </div>
                  <span className="text-gray-400 text-sm">({product.reviews} reviews)</span>
                </div>
              </div>
              <div className="flex space-x-2">
                <button className="p-3 bg-gray-50 rounded-full hover:bg-secondary transition-colors text-gray-400 hover:text-primary">
                  <Share2 className="w-5 h-5" />
                </button>
                <button className="p-3 bg-gray-50 rounded-full hover:bg-secondary transition-colors text-gray-400 hover:text-accent">
                  <Heart className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 mb-10 pb-10 border-b border-gray-100">
              <p className="text-4xl font-bold text-neutral-900 mb-2">PKR {product.price.toLocaleString()}</p>
              <p className="text-sm text-green-600 font-medium flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                In Stock & Ready to Ship
              </p>
            </div>

            <div className="space-y-8 mb-12">
              <div className="flex items-center space-x-6">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-4 py-2 hover:bg-gray-50 transition-colors border-r border-gray-200">-</button>
                  <span className="px-6 py-2 font-bold">{quantity}</span>
                  <button onClick={() => setQuantity(q => q + 1)} className="px-4 py-2 hover:bg-gray-50 transition-colors border-l border-gray-200">+</button>
                </div>
                <button 
                  onClick={addToCart}
                  className="flex-1 btn-primary py-4 flex items-center justify-center space-x-3 text-lg"
                >
                  <ShoppingCart className="w-6 h-6" />
                  <span>Add to Cart</span>
                </button>
              </div>
              <button className="w-full btn-secondary py-4 text-lg bg-white border-2 border-primary">Buy Now (BNPL Available)</button>
            </div>

            {/* Features/Trust */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
              <div className="flex items-center space-x-3 p-4 bg-secondary-light rounded-xl">
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-xs font-semibold">Free Delivery</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-secondary-light rounded-xl">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span className="text-xs font-semibold">Authentic Product</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-secondary-light rounded-xl">
                <RefreshCw className="w-5 h-5 text-primary" />
                <span className="text-xs font-semibold">7 Days Return</span>
              </div>
            </div>

            {/* Product Details */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold">Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-12">
                {product.details.map((detail, idx) => (
                  <div key={idx} className="flex justify-between py-2 border-b border-gray-50">
                    <span className="text-gray-500">{detail.label}</span>
                    <span className="font-semibold text-neutral-800">{detail.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-600 leading-relaxed pt-4">
                {product.description}
              </p>
            </div>

            {/* Seller Info */}
            <div className="mt-12 p-6 border-2 border-dashed border-secondary-dark rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xl">
                  {product.seller.name[0]}
                </div>
                <div>
                  <p className="font-bold text-neutral-900">{product.seller.name}</p>
                  <p className="text-xs text-gray-400">Top Rated Seller since {product.seller.since}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
                <Star className="w-3 h-3 text-primary fill-primary" />
                <span className="text-xs font-bold">{product.seller.rating}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;

import React, { useState, useEffect } from 'react';

export default function Navbar() {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const handleScroll = () => {
            // Reappear ONLY when scrolled back to top (scrollY === 0)
            if (window.scrollY === 0) {
                setVisible(true);
            } else {
                setVisible(false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 w-full transition-transform duration-300 z-50 ${visible ? 'translate-y-0' : '-translate-y-full'}`}>
            {/* Navbar Content */}
        </nav>
    );
}
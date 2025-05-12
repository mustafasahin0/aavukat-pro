'use client';

import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl'; // Optional size prop
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto bg-black bg-opacity-50 transition-opacity duration-300 ease-in-out"
      onClick={onClose} // Close on backdrop click
    >
      <div
        className={`relative w-full p-6 mx-auto my-6 bg-white rounded-lg shadow-xl transform transition-all duration-300 ease-in-out ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking inside modal content
      >
        {/* Modal header */}
        {title && (
          <div className="flex items-start justify-between pb-4 border-b border-gray-200 rounded-t">
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 ml-auto bg-transparent border-0 text-black float-right text-3xl leading-none font-semibold outline-none focus:outline-none opacity-50 hover:opacity-100"
              aria-label="Close"
            >
              <span className="block w-6 h-6 text-2xl bg-transparent outline-none focus:outline-none">×</span>
            </button>
          </div>
        )}
        {/* Modal body */}
        <div className="relative flex-auto py-4">
          {children}
        </div>
        {/* Optional: Modal footer could be added here if needed, passed as a prop or specific to each modal instance */}
      </div>
    </div>
  );
};

export default Modal; 
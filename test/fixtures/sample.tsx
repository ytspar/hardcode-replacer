import React from 'react';

export function Button({ children }) {
  return (
    <button
      className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600"
      style={{ borderColor: '#ff0000', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}
    >
      {children}
    </button>
  );
}

export function Card({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 style={{ color: 'coral' }}>{title}</h2>
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function Badge() {
  return (
    <span
      className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm"
      style={{ backgroundColor: '#dbeafe' }}
    >
      New
    </span>
  );
}

const styles = {
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: hsl(220, 90%, 56%),
  },
  footer: {
    backgroundColor: '#1a1a2e',
    color: rgb(200, 200, 210),
    borderTop: '1px solid oklch(0.5 0.2 240)',
  },
};

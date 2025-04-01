'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardNav() {
  const pathname = usePathname();

  // Determinar el índice activo basado en la ruta actual
  const getActiveTab = () => {
    if (pathname === '/dashboard') return 'dashboard';
    if (pathname === '/dashboard/sitemaps') return 'sitemaps';
    if (pathname.includes('/reprocess')) return 'reprocess';
    return 'dashboard';
  };

  const activeTab = getActiveTab();

  return (
    <div className="mb-6 bg-white shadow rounded-lg">
      <div className="sm:hidden">
        <select 
          className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={activeTab}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'dashboard') window.location.href = '/dashboard';
            else if (value === 'sitemaps') window.location.href = '/dashboard/sitemaps';
            else if (value === 'reprocess') window.location.href = '/reprocess';
            else window.location.href = '/';
          }}
        >
          <option value="dashboard">Panel de Control</option>
          <option value="sitemaps">Sitemaps Procesados</option>
          <option value="reprocess">Reprocesar URLs</option>
          <option value="extractor">Volver al Extractor</option>
        </select>
      </div>
      <div className="hidden sm:block">
        <nav className="flex">
          <Link 
            href="/dashboard" 
            className={`px-4 py-3 text-center border-b-2 ${activeTab === 'dashboard' ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent hover:text-gray-700 hover:border-gray-300'} flex-1`}
          >
            Panel de Control
          </Link>
          <Link 
            href="/dashboard/sitemaps" 
            className={`px-4 py-3 text-center border-b-2 ${activeTab === 'sitemaps' ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent hover:text-gray-700 hover:border-gray-300'} flex-1`}
          >
            Sitemaps Procesados
          </Link>
          <Link 
            href="/reprocess" 
            className={`px-4 py-3 text-center border-b-2 ${activeTab === 'reprocess' ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent hover:text-gray-700 hover:border-gray-300'} flex-1`}
          >
            Reprocesar URLs
          </Link>
          <Link 
            href="/" 
            className={`px-4 py-3 text-center border-b-2 ${activeTab === 'extractor' ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent hover:text-gray-700 hover:border-gray-300'} flex-1`}
          >
            Volver al Extractor
          </Link>
        </nav>
      </div>
    </div>
  );
} 
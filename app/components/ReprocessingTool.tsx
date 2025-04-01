'use client';

import { useState, useEffect } from 'react';
import { Card, Text } from '@tremor/react';
import Link from 'next/link';

export default function ReprocessingTool() {
  const [status, setStatus] = useState<string>('completed');
  const [limit, setLimit] = useState<number>(100);
  const [sitemap, setSitemap] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [sitemaps, setSitemaps] = useState<string[]>([]);

  // Obtener lista de sitemaps disponibles
  useEffect(() => {
    const fetchSitemaps = async () => {
      try {
        const response = await fetch(`/api/sitemaps?_t=${Date.now()}`);
        if (response.ok) {
          const data = await response.json();
          // Si data es un array, buscar la propiedad url en cada elemento
          if (Array.isArray(data)) {
            const uniqueSitemaps = [...new Set(data.map((item: any) => item.url))];
            setSitemaps(uniqueSitemaps);
          } else if (data.sitemaps && Array.isArray(data.sitemaps)) {
            // Si data tiene una propiedad sitemaps que es un array
            const uniqueSitemaps = [...new Set(data.sitemaps.map((url: string) => url))];
            setSitemaps(uniqueSitemaps);
          }
          console.log("Sitemaps cargados:", data);
        }
      } catch (err) {
        console.error('Error al obtener sitemaps:', err);
      }
    };

    fetchSitemaps();
  }, []);

  // Verificar si hay un proceso activo
  useEffect(() => {
    const checkProcessingStatus = async () => {
      try {
        const response = await fetch(`/api/reprocess?_t=${Date.now()}`);
        if (response.ok) {
          const data = await response.json();
          setIsProcessing(data.isProcessing);
          if (data.isProcessing) {
            setMessage('Hay un proceso de reprocesamiento activo');
          }
        }
      } catch (err) {
        console.error('Error al verificar estado:', err);
      }
    };

    checkProcessingStatus();
    
    if (isProcessing) {
      const interval = setInterval(checkProcessingStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isProcessing]);

  // Iniciar reprocesamiento
  const startReprocessing = async () => {
    setError('');
    setMessage('');

    try {
      // Validar el límite
      if (limit <= 0 || limit > 1000) {
        setError('El límite debe estar entre 1 y 1000');
        return;
      }

      console.log("Iniciando reprocesamiento con:", {
        status,
        limit,
        sitemap
      });

      const params = {
        status,
        limit,
        sitemap: sitemap || undefined
      };

      const response = await fetch('/api/reprocess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      const data = await response.json();

      if (response.ok) {
        setIsProcessing(true);
        setMessage(`Reprocesamiento iniciado con éxito. Procesando ${limit} URLs con estado ${status || 'cualquiera'}.`);
      } else {
        setError(data.error || 'Error al iniciar el reprocesamiento');
      }
    } catch (err: any) {
      setError(`Error: ${err.message}`);
    }
  };

  // Manejar cambio en el selector de estado
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value);
  };

  // Manejar cambio en el selector de sitemap
  const handleSitemapChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSitemap(e.target.value);
  };

  return (
    <Card className="mt-6">
      <h2 className="text-xl font-bold">Herramienta de Reprocesamiento</h2>
      <Text className="mt-2">
        Esta herramienta permite reprocesar URLs existentes para extraer información adicional: email, título, descripción y dirección.
      </Text>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700 font-medium">Error</p>
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {message && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-700 font-medium">Información</p>
          <p className="text-green-600">{message}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <label htmlFor="status-select" className="block text-sm font-medium text-gray-700 mb-2">
            Estado de URLs
          </label>
          <select
            id="status-select"
            value={status}
            onChange={handleStatusChange}
            disabled={isProcessing}
            className="w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="completed">Completadas</option>
            <option value="error">Con error</option>
            <option value="pending">Pendientes</option>
            <option value="processing">En procesamiento</option>
          </select>
        </div>

        <div>
          <label htmlFor="limit-input" className="block text-sm font-medium text-gray-700 mb-2">
            Límite de URLs
          </label>
          <input
            id="limit-input"
            type="number"
            value={limit.toString()}
            onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
            disabled={isProcessing}
            min={1}
            max={1000}
            className="w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="sitemap-select" className="block text-sm font-medium text-gray-700 mb-2">
            Sitemap (opcional)
          </label>
          <select
            id="sitemap-select"
            value={sitemap}
            onChange={handleSitemapChange}
            disabled={isProcessing}
            className="w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="">Todos los sitemaps</option>
            {sitemaps.length > 0 ? (
              sitemaps.map((url) => (
                <option key={url} value={url}>
                  {url}
                </option>
              ))
            ) : (
              <option value="" disabled>Cargando sitemaps...</option>
            )}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={startReprocessing}
            disabled={isProcessing}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </>
            ) : (
              'Iniciar Reprocesamiento'
            )}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <Text className="text-sm text-gray-500">
          <strong>Nota:</strong> El reprocesamiento se ejecuta en segundo plano. Puedes cerrar esta página y el proceso continuará.
          Los resultados se guardarán automáticamente en la base de datos.
        </Text>
      </div>
    </Card>
  );
} 
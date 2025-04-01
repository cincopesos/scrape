import ReprocessingTool from '@/app/components/ReprocessingTool';
import DashboardNav from '@/app/components/DashboardNav';
import { Card, Text } from '@tremor/react';

export default function ReprocessPage() {
  return (
    <main className="p-4 md:p-10 mx-auto max-w-7xl">
      <DashboardNav />
      
      <h1 className="text-2xl font-bold mb-2">Herramienta de Reprocesamiento</h1>
      <Text>
        Esta herramienta te permite reprocesar URLs existentes para extraer información adicional como emails, títulos, descripciones y direcciones.
      </Text>
      
      <ReprocessingTool />
      
      <Card className="mt-6">
        <h2 className="text-xl font-bold mb-2">Instrucciones de uso</h2>
        <Text className="mt-2">
          1. <strong>Selecciona el estado</strong> de las URLs que deseas reprocesar (completadas, con error, pendientes o en procesamiento).
        </Text>
        <Text className="mt-2">
          2. <strong>Establece un límite</strong> de cuántas URLs deseas procesar (máximo 1000).
        </Text>
        <Text className="mt-2">
          3. <strong>Selecciona un sitemap específico</strong> (opcional) para filtrar solo las URLs de ese sitemap.
        </Text>
        <Text className="mt-2">
          4. <strong>Haz clic en "Iniciar Reprocesamiento"</strong> para comenzar el proceso.
        </Text>
        <Text className="mt-4">
          <strong>Nota importante:</strong> El reprocesamiento puede tardar varios minutos dependiendo del número de URLs. 
          Puedes revisar el panel de control mientras tanto para ver los resultados actualizados.
        </Text>
      </Card>
      
      <Card className="mt-6">
        <h2 className="text-xl font-bold mb-2">¿Por qué reprocesar URLs?</h2>
        <Text className="mt-2">
          Algunas URLs pueden no haber sido procesadas correctamente en el primer intento debido a:
        </Text>
        <ul className="list-disc pl-6 mt-2">
          <li>Tiempos de espera agotados durante la extracción inicial</li>
          <li>Problemas temporales de conexión a los sitios web</li>
          <li>Páginas web con estructuras complejas que requieren un análisis más profundo</li>
          <li>Informción oculta o cargada dinámicamente que no fue detectada inicialmente</li>
        </ul>
        <Text className="mt-4">
          El reprocesamiento utiliza técnicas mejoradas para extraer:
        </Text>
        <ul className="list-disc pl-6 mt-2">
          <li><strong>Emails:</strong> Detección avanzada tanto en HTML como en enlaces mailto:</li>
          <li><strong>Títulos:</strong> Extracción precisa de las etiquetas title</li>
          <li><strong>Descripciones:</strong> Análisis de meta descripciones y datos estructurados</li>
          <li><strong>Direcciones:</strong> Búsqueda inteligente de patrones de direcciones y datos schema.org</li>
        </ul>
      </Card>
    </main>
  );
} 
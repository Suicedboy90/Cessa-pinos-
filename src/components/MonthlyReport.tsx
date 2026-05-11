import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication } from '../types';
import { Download, Loader2, PieChart } from 'lucide-react';
import * as xlsx from 'xlsx';
import { formatDateWithMonthName } from '../lib/utils';

export default function MonthlyReport() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'medications'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meds: Medication[] = [];
      snapshot.forEach((d) => {
        meds.push({ id: d.id, ...d.data() } as Medication);
      });
      setMedications(meds);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'medications');
    });

    return () => unsubscribe();
  }, []);

  const handleExportExcel = () => {
    const dataToExport = medications.map(m => {
      const exPasado = m.existencia_mes_pasado || 0;
      const surtido = m.surtido || 0;
      const totalMes = exPasado + surtido;
      const salidas = totalMes > m.stock_actual ? totalMes - m.stock_actual : 0;

      return {
        'Clave / Nombre': `[${m.clave}] ${m.nombre}`,
        'Ex. Mes Pasado': `${exPasado}${m.fecha_existencia_mes_pasado ? `\n(${formatDateWithMonthName(m.fecha_existencia_mes_pasado)})` : ''}`,
        'Surtido': `+${surtido}${m.fecha_surtido ? `\n(${formatDateWithMonthName(m.fecha_surtido)})` : ''}`,
        'Total Disp.': totalMes,
        'Salidas Totales': `-${salidas}`,
        'Stock Actual': m.stock_actual
      };
    });
    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    
    // Auto-fit columns
    if (dataToExport.length > 0) {
      const wscols = Object.keys(dataToExport[0]).map(key => {
        const maxLength = Math.max(
          key.length,
          ...dataToExport.map(row => String(row[key as keyof typeof row] || '').length)
        );
        return { wch: Math.min(maxLength + 2, 100) }; // Cap at 100 characters width
      });
      worksheet['!cols'] = wscols;
    }

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Kárdex Mensual');
    xlsx.writeFile(workbook, 'Reporte_Mensual_Farmacia.xlsx');
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 inline-flex items-center">
          <PieChart className="w-5 h-5 mr-2 text-blue-500" />
          Kárdex y Movimientos Mensuales
        </h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar Excel
          </button>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-200 sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clave / Nombre</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ex. Mes Pasado</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Surtido</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-blue-600 uppercase tracking-wider">Total Disp.</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Salidas Totales</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Stock Actual</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {medications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">
                    No hay medicamentos registrados.
                  </td>
                </tr>
              ) : (
                medications.map((m) => {
                  const exPasado = m.existencia_mes_pasado || 0;
                  const surtido = m.surtido || 0;
                  const totalMes = exPasado + surtido;
                  const salidas = totalMes > m.stock_actual ? totalMes - m.stock_actual : 0;

                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{m.clave}</div>
                        <div className="text-gray-500 text-xs">{m.nombre}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                        <div>{exPasado}</div>
                        {m.fecha_existencia_mes_pasado && <div className="text-[10px] text-gray-400 mt-1">{formatDateWithMonthName(m.fecha_existencia_mes_pasado)}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                        <div>+{surtido}</div>
                        {m.fecha_surtido && <div className="text-[10px] text-gray-400 mt-1">{formatDateWithMonthName(m.fecha_surtido)}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-blue-600 border-x border-gray-100 bg-blue-50/10">
                        {totalMes}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                        -{salidas}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900 bg-gray-50">
                        {m.stock_actual}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication } from '../types';
import { Download, Loader2, PieChart } from 'lucide-react';
import * as xlsx from 'xlsx';

interface LogRecord {
  id: string;
  medicationId: string;
  cantidad: number;
  dateField: string | { toDate: () => Date } | null;
  type: 'patient' | 'log';
  [key: string]: unknown;
}

export default function MonthlyReport() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [allLogs, setAllLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');

  useEffect(() => {
    // Listen to medications
    const qMeds = query(collection(db, 'medications'), orderBy('updatedAt', 'desc'));
    const unsubscribeMeds = onSnapshot(qMeds, (snapshot) => {
      const meds: Medication[] = [];
      snapshot.forEach((d) => {
        meds.push({ id: d.id, ...d.data() } as Medication);
      });
      setMedications(meds);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'medications');
    });

    const unsubscribePatients = onSnapshot(collection(db, 'patientsRegistry'), (snapshot) => {
      const records = snapshot.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          ...data,
          medicationId: data.medicationId,
          cantidad: data.cantidad,
          type: 'patient' as const, 
          dateField: data.fecha || data.createdAt 
        };
      });
      
      const unsubscribeLogs = onSnapshot(collection(db, 'logs'), (logSnapshot) => {
        const logs = logSnapshot.docs.map(d => {
          const data = d.data();
          return { 
            id: d.id, 
            ...data,
            medicationId: data.medicationId,
            cantidad: data.cantidad,
            type: 'log' as const, 
            dateField: data.fechaEgreso || data.createdAt 
          };
        });
        
        setAllLogs([...records, ...logs] as LogRecord[]);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'logs');
        setLoading(false);
      });

      return unsubscribeLogs;
      
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'patientsRegistry');
      setLoading(false);
    });

    return () => {
      unsubscribeMeds();
      unsubscribePatients();
    };
  }, []);

  const parseDate = (d: unknown): Date => {
    if (!d) return new Date();
    const maybeTimestamp = d as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate();
    }
    const date = new Date(d as string | number);
    return isNaN(date.getTime()) ? new Date() : date;
  };

  const getMonthKey = (d: unknown) => {
    const date = parseDate(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 2);
    return date.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  };

  // Available months should come from logs and medications
  const availableMonths = Array.from(new Set([
    ...medications.map(m => getMonthKey(m.updatedAt)),
    ...allLogs.map(l => getMonthKey(l.dateField))
  ])).filter(key => {
    const year = parseInt(key.split('-')[0]);
    return year >= 2024;
  }).sort().reverse();

  // Calculation per month
  const getReportingData = () => {
    const targetMonths = selectedMonthFilter === 'all' ? availableMonths : [selectedMonthFilter];
    
    const report: Record<string, (Medication & { calculatedSalidas: number; calculatedDisponible: number })[]> = {};

    targetMonths.forEach(monthKey => {
      const monthName = getMonthName(monthKey);
      
      const medsInReport = medications.map(m => {
        const monthSalidas = allLogs
          .filter(l => l.medicationId === m.id && getMonthKey(l.dateField) === monthKey)
          .reduce((sum, l) => sum + (l.cantidad || 0), 0);
        
        return {
          ...m,
          calculatedSalidas: monthSalidas,
          calculatedDisponible: m.stock_actual + monthSalidas
        };
      }).filter(m => m.calculatedSalidas > 0 || m.stock_actual > 0);

      if (medsInReport.length > 0) {
        report[monthName] = medsInReport;
      }
    });

    return report;
  };

  const groupedData = getReportingData();

  const handleExportExcel = () => {
    const exportData: Record<string, string | number>[] = [];
    
    Object.entries(groupedData).forEach(([month, meds]) => {
      exportData.push({ 'MES / PRODUCTO': month.toUpperCase(), 'Clave': '', 'Nombre': '', 'Ex. Mes Pasado': '', 'Surtido': '', 'Disp. Total': '', 'Salidas (Bitácora)': '', 'Stock Físico Final': '' });
      
      meds.forEach(m => {
        exportData.push({
          'MES / PRODUCTO': m.nombre,
          'Clave': m.clave,
          'Nombre': m.nombre,
          'Ex. Mes Pasado': m.existencia_mes_pasado || 0,
          'Surtido': m.surtido || 0,
          'Disp. Total': m.calculatedDisponible,
          'Salidas (Bitácora)': `-${m.calculatedSalidas}`,
          'Stock Físico Final': m.stock_actual
        });
      });
      
      exportData.push({});
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Kárdex Mensual Real');
    xlsx.writeFile(workbook, `Reporte_Mensual_Real_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between px-2 sm:px-0">
        <h2 className="text-lg font-bold text-gray-900 inline-flex items-center">
          <PieChart className="w-5 h-5 mr-2 text-blue-500" />
          Kárdex y Movimientos
        </h2>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedMonthFilter}
            onChange={(e) => setSelectedMonthFilter(e.target.value)}
            className="w-full sm:w-48 rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
          >
            <option value="all">Todos los meses</option>
            {availableMonths.map(month => (
              <option key={month} value={month}>
                {new Date(month + '-02').toLocaleString('es-MX', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          <button
            onClick={handleExportExcel}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 shadow-sm text-sm font-bold rounded-lg text-white bg-green-600 hover:bg-green-700 min-h-[44px]"
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar Excel
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {medications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
            No hay medicamentos registrados o actividad en este periodo.
          </div>
        ) : Object.entries(groupedData).map(([month, meds]) => (
          <div key={month} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{month}</h3>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 shadow-sm">
                {meds.length} productos con movimiento o stock
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Clave / Nombre</th>
                    <th scope="col" className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ex. Pasado</th>
                    <th scope="col" className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Surtido</th>
                    <th scope="col" className="px-6 py-3 text-right text-[10px] font-bold text-blue-600 uppercase tracking-wider">Disp. Total (Mes)</th>
                    <th scope="col" className="px-6 py-3 text-right text-[10px] font-bold text-red-600 uppercase tracking-wider">Salidas (Bitácora)</th>
                    <th scope="col" className="px-6 py-3 text-right text-[10px] font-bold text-gray-900 uppercase tracking-wider">Stock Físico (Final)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {meds.map((m) => {
                    return (
                      <tr key={m.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="font-bold text-gray-800">{m.clave}</div>
                          <div className="text-gray-500 text-[11px] leading-tight mt-0.5 line-clamp-1">{m.nombre}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400 font-medium">
                          {m.existencia_mes_pasado || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400 font-medium">
                          {m.surtido || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-700 bg-blue-50/20">
                          {m.calculatedDisponible}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 font-black">
                          {m.calculatedSalidas > 0 ? `-${m.calculatedSalidas}` : '0'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-black text-gray-900 bg-gray-50/50">
                          {m.stock_actual}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

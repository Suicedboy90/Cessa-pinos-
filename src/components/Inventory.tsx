import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication } from '../types';
import { Plus, Download, AlertTriangle, Edit2, Trash2, Loader2, Search } from 'lucide-react';
import * as xlsx from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from './Modal';
import { cn, formatDateWithMonthName, getLocalDateString, getExpirationStatus, getTimeRemainingMessage } from '../lib/utils';

interface InventoryProps {
  systemId: string;
}

export default function Inventory({ systemId }: InventoryProps) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [medToDelete, setMedToDelete] = useState<Medication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Form State
  const [num, setNum] = useState('');
  const [clave, setClave] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [presentacion, setPresentacion] = useState('');
  const [stock, setStock] = useState('0');
  const [existenciaPasado, setExistenciaPasado] = useState('0');
  const [fechaExistenciaPasado, setFechaExistenciaPasado] = useState('');
  const [surtido, setSurtido] = useState('0');
  const [fechaSurtido, setFechaSurtido] = useState('');
  const [fechaCaducidad, setFechaCaducidad] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculate stock
  useEffect(() => {
    const total = (parseInt(existenciaPasado, 10) || 0) + (parseInt(surtido, 10) || 0);
    setStock(total.toString());
  }, [existenciaPasado, surtido]);

  useEffect(() => {
    const q = query(collection(db, 'medications'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meds: Medication[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        // Only include active medications and those belonging to the current system id
        if (data.activo !== false && data.systemId === systemId) {
          meds.push({ id: d.id, ...data } as Medication);
        }
      });
      setMedications(meds);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'medications');
    });

    return () => {
      unsubscribe();
    };
  }, [systemId]);

  const lowStockMeds = medications.filter(m => m.stock_actual <= 5);
  
  const expiredMeds = medications.filter(m => getExpirationStatus(m.fecha_caducidad) === 'expired');
  const warningMeds = medications.filter(m => getExpirationStatus(m.fecha_caducidad) === 'warning');
  
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

  // All available months in the data
  const availableMonths = Array.from(new Set(medications.map(m => getMonthKey(m.updatedAt))))
    .filter(key => parseInt(key.split('-')[0]) >= 2024)
    .sort()
    .reverse();

  const filteredMeds = medications.filter(m => {
    const matchesSearch = m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         m.clave.includes(searchTerm);
    
    if (selectedMonthFilter === 'all') return matchesSearch;
    
    return matchesSearch && getMonthKey(m.updatedAt) === selectedMonthFilter;
  });

  const groupedMeds = filteredMeds.reduce((acc, curr) => {
    const monthKey = getMonthKey(curr.updatedAt);
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(curr);
    return acc;
  }, {} as Record<string, Medication[]>);

  const monthKeysInOrder = Object.keys(groupedMeds).sort().reverse();

  const handleExportInventoryExcel = () => {
    const exportData: Record<string, string | number>[] = [];
    
    monthKeysInOrder.forEach(monthKey => {
      const monthName = getMonthName(monthKey).toUpperCase();
      exportData.push({ 'MES / PRODUCTO': monthName, 'Clave': '', 'Nombre': '', 'Ex. Mes Pasado': '', 'Surtido': '', 'Stock Físico Final': '', 'Caducidad': '' });
      
      groupedMeds[monthKey].forEach(m => {
        exportData.push({
          'MES / PRODUCTO': m.nombre,
          'Clave': m.clave,
          'Nombre': m.nombre,
          'Ex. Mes Pasado': m.existencia_mes_pasado || 0,
          'Surtido': m.surtido || 0,
          'Stock Físico Final': m.stock_actual,
          'Caducidad': m.fecha_caducidad ? formatDateWithMonthName(m.fecha_caducidad) : '-'
        });
      });
      
      exportData.push({});
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventario Mensual');
    
    xlsx.writeFile(workbook, `Inventario_Farmacia_Mensual_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text('Inventario de Medicamentos - Botica CESSA Pinos', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`Reporte de Existencias (${formatDateWithMonthName(getLocalDateString())})`, pageWidth / 2, 22, { align: 'center' });

    const tableData = filteredMeds.map(m => [
      m.num,
      m.clave,
      m.nombre,
      m.presentacion,
      m.stock_actual,
      m.fecha_caducidad ? formatDateWithMonthName(m.fecha_caducidad) : '-',
      m.descripcion || '-'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Num', 'Clave', 'Medicamento', 'Pres.', 'Stock', 'Caducidad', 'Descripción']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 25 },
        2: { cellWidth: 45 },
        3: { cellWidth: 25 },
        4: { cellWidth: 15 },
        5: { cellWidth: 25 },
        6: { cellWidth: 'auto' }
      }
    });

    doc.save(`Inventario_Farmacia_${getLocalDateString()}.pdf`);
  };

  const resetForm = () => {
    setNum('');
    setClave('');
    setNombre('');
    setDescripcion('');
    setPresentacion('');
    setStock('0');
    setExistenciaPasado('0');
    setFechaExistenciaPasado('');
    setSurtido('0');
    setFechaSurtido('');
    setFechaCaducidad('');
    setEditingMed(null);
  };

  const openEdit = (m: Medication) => {
    setEditingMed(m);
    setNum(m.num.toString());
    setClave(m.clave);
    setNombre(m.nombre);
    setDescripcion(m.descripcion);
    setPresentacion(m.presentacion);
    setStock(m.stock_actual.toString());
    setExistenciaPasado((m.existencia_mes_pasado || 0).toString());
    setFechaExistenciaPasado(m.fecha_existencia_mes_pasado || '');
    setSurtido((m.surtido || 0).toString());
    setFechaSurtido(m.fecha_surtido || '');
    setFechaCaducidad(m.fecha_caducidad || '');
    setIsModalOpen(true);
  };

  const openDelete = (m: Medication) => {
    setMedToDelete(m);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!medToDelete) return;
    setIsDeleting(true);
    try {
      const ref = doc(db, 'medications', medToDelete.id);
      const deletePromise = updateDoc(ref, {
        activo: false,
        updatedAt: serverTimestamp()
      });
      
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 300));
      await Promise.race([deletePromise, timeoutPromise]);
      
      setIsDeleteModalOpen(false);
      setMedToDelete(null);
    } catch (err: unknown) {
      console.error('Error deactivating medication:', err);
      setError('Error al eliminar el medicamento. Por favor intente de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      let savePromise;
      if (editingMed) {
        const ref = doc(db, 'medications', editingMed.id);
        savePromise = updateDoc(ref, {
          num: parseInt(num, 10) || 0,
          clave,
          nombre,
          descripcion,
          presentacion,
          stock_actual: parseInt(stock, 10) || 0,
          existencia_mes_pasado: parseInt(existenciaPasado, 10) || 0,
          fecha_existencia_mes_pasado: fechaExistenciaPasado || null,
          surtido: parseInt(surtido, 10) || 0,
          fecha_surtido: fechaSurtido || null,
          fecha_caducidad: fechaCaducidad || null,
          activo: true, // Ensure it's active if we're editing it
          updatedAt: serverTimestamp()
        });
      } else {
        // Just check if there is an ACTIVE medication with the same clave to avoid duplicates in the UI
        const existingActive = medications.find(m => m.clave === clave);
        if (existingActive) {
          setError(`Ya existe un medicamento activo con la clave: ${clave}`);
          setIsSaving(false);
          return;
        }

        const newId = doc(collection(db, 'medications')).id;
        
        savePromise = setDoc(doc(db, 'medications', newId), {
          num: parseInt(num, 10) || 0,
          clave,
          nombre,
          descripcion,
          presentacion,
          stock_actual: parseInt(stock, 10) || 0,
          existencia_mes_pasado: parseInt(existenciaPasado, 10) || 0,
          fecha_existencia_mes_pasado: fechaExistenciaPasado || null,
          surtido: parseInt(surtido, 10) || 0,
          fecha_surtido: fechaSurtido || null,
          fecha_caducidad: fechaCaducidad || null,
          activo: true, // New medications are active
          systemId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 300));
      await Promise.race([savePromise, timeoutPromise]);
      
      resetForm();
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error('Error saving medication:', err);
      let message = 'Error al guardar el medicamento. Por favor intente de nuevo.';
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      if (errorMessage.includes('quota')) {
        message = 'Se ha excedido la cuota gratuita de Firebase (Plan Spark). El registro se guardará localmente.';
      } else if (errorMessage.includes('permission')) {
        message = 'Error de permisos: No tiene autorización.';
      } else if (errorMessage) {
        try {
          const parsed = JSON.parse(errorMessage);
          if (parsed.error) message = `Error: ${parsed.error}`;
        } catch {
          message = errorMessage;
        }
      }
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {lowStockMeds.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Alerta de Stock Bajo</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              Hay {lowStockMeds.length} medicamento(s) con stock crítico (5 unidades o menos).
            </p>
          </div>
        </div>
      )}

      {(expiredMeds.length > 0 || warningMeds.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {expiredMeds.length > 0 && (
            <div className="bg-red-600 dark:bg-red-700 border-l-4 border-red-800 dark:border-red-900 p-4 rounded-md flex items-start gap-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-white mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white">¡Medicamentos Caducados!</h3>
                <p className="text-sm text-red-50 dark:text-red-100 mt-1">
                  Hay {expiredMeds.length} medicamento(s) que ya han caducado. Favor de retirarlos inmediatamente del stock activo.
                </p>
                <div className="mt-3 space-y-2">
                  {expiredMeds.map(m => (
                     <div key={m.id} className="bg-red-700/40 dark:bg-red-900/40 p-2 rounded border border-red-500/30 text-white flex flex-col gap-1">
                        <div className="flex justify-between items-start">
                           <span className="font-bold text-xs uppercase">{m.nombre}</span>
                           <span className="text-[10px] bg-red-800 dark:bg-red-950 px-1.5 py-0.5 rounded font-black">{getTimeRemainingMessage(m.fecha_caducidad)}</span>
                        </div>
                        <div className="grid grid-cols-2 text-[10px] text-red-100 gap-2">
                           <div><span className="opacity-70">Clave:</span> {m.clave}</div>
                           <div className="text-right"><span className="opacity-70">Presentación:</span> {m.presentacion}</div>
                        </div>
                        <div className="text-[10px] font-bold mt-1 text-red-100 flex justify-between items-center bg-red-900/40 dark:bg-red-950/40 px-2 py-1 rounded">
                           <span>STOCK ACTUAL:</span>
                           <span className="text-xs">{m.stock_actual} piezas</span>
                        </div>
                     </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {warningMeds.length > 0 && (
            <div className="bg-amber-100 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-md flex items-start gap-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200">Próximos a Caducar</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Hay {warningMeds.length} medicamento(s) que caducarán pronto. El sistema recomienda priorizar su salida.
                </p>
                <div className="mt-3 space-y-2">
                  {warningMeds.map(m => (
                    <div key={m.id} className="bg-amber-50 dark:bg-amber-900/40 p-2 rounded border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-100 flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs uppercase">{m.nombre}</span>
                        <span className="text-[10px] bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 rounded font-black text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          {getTimeRemainingMessage(m.fecha_caducidad)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 text-[10px] text-amber-700 dark:text-amber-300 gap-2">
                        <div><span className="opacity-70">Clave:</span> {m.clave}</div>
                        <div className="text-right"><span className="opacity-70">Presentación:</span> {m.presentacion}</div>
                      </div>
                      <div className="text-[10px] font-bold mt-1 text-amber-800 dark:text-amber-200 flex justify-between items-center bg-amber-100/50 dark:bg-amber-900/50 px-2 py-1 rounded border border-amber-200/50 dark:border-amber-800/50">
                        <span>STOCK ACTUAL:</span>
                        <span className="text-xs">{m.stock_actual} piezas</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col md:flex-row gap-4 w-full md:flex-1">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              placeholder="Buscar por clave o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-56">
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base outline-none cursor-pointer"
            >
              <option value="all">Modificados (Todo)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{getMonthName(m)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportInventoryExcel}
            className="flex items-center justify-center px-4 py-2.5 border border-green-300 dark:border-green-800 shadow-sm text-xs font-medium rounded-lg text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 min-h-[44px]"
          >
            <Download className="w-4 h-4 mr-1 sm:mr-2" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-700 shadow-sm text-xs font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]"
          >
            <Download className="w-4 h-4 mr-1 sm:mr-2 text-red-600 dark:text-red-400" />
            PDF
          </button>
          <button
            onClick={() => { 
              resetForm(); 
              const maxN = medications.length > 0 ? Math.max(...medications.map(m => m.num)) : 0;
              setNum((maxN + 1).toString());
              setIsModalOpen(true); 
            }}
            className="col-span-2 md:col-span-1 inline-flex items-center justify-center px-4 py-2.5 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Registro
          </button>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-200 dark:border-gray-800 sm:rounded-lg bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          {filteredMeds.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              No se encontraron medicamentos.
            </div>
          ) : (
            <div className="space-y-6">
              {monthKeysInOrder.map((monthKey) => (
                <div key={monthKey} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-3 flex justify-between items-center sticky top-0 z-10 border-y border-gray-200 dark:border-gray-800">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Modificados en {getMonthName(monthKey)}
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50/50 dark:bg-gray-800/30">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Núm.</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Clave</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Medicamento</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Presentación</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ex. Pasado</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Surtido</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Caducidad</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock Físico</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-800">
                      {groupedMeds[monthKey].map((m) => (
                        <tr key={m.id} className={cn(m.stock_actual <= 5 ? "bg-red-50/30 dark:bg-red-900/10" : "", "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors")}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white border-r border-gray-100 dark:border-gray-800">
                            {m.num}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">
                            {m.clave}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-100 w-1/4">
                            <div className="font-bold text-gray-900 dark:text-white">{m.nombre}</div>
                            {m.descripcion && <div className="text-gray-500 dark:text-gray-400 text-xs mt-1 italic leading-tight">{m.descripcion}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {m.presentacion}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                            <div>{m.existencia_mes_pasado || 0}</div>
                            {m.fecha_existencia_mes_pasado && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{formatDateWithMonthName(m.fecha_existencia_mes_pasado)}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400 font-bold bg-green-50/20 dark:bg-green-900/10">
                            <div>+{m.surtido || 0}</div>
                            {m.fecha_surtido && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{formatDateWithMonthName(m.fecha_surtido)}</div>}
                          </td>
                          <td className={cn(
                            "px-4 py-4 whitespace-nowrap text-sm",
                            getExpirationStatus(m.fecha_caducidad) === 'expired' ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 font-black" : 
                            getExpirationStatus(m.fecha_caducidad) === 'warning' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 font-bold" : "text-gray-500 dark:text-gray-400"
                          )}>
                            {m.fecha_caducidad ? (
                              <>
                                <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400 mb-0.5">{formatDateWithMonthName(m.fecha_caducidad)}</div>
                                <div className="leading-tight">
                                  {getTimeRemainingMessage(m.fecha_caducidad)}
                                </div>
                                {getExpirationStatus(m.fecha_caducidad) === 'expired' && <div className="text-[9px] uppercase mt-1 px-1.5 py-0.5 bg-red-600 dark:bg-red-500 text-white rounded inline-block">¡RETIRAR!</div>}
                              </>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">No definida</span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black",
                              m.stock_actual <= 5 ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200" : "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
                            )}>
                              {m.stock_actual}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium min-w-[100px]">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => openEdit(m)}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 focus:outline-none transition-colors p-2 bg-blue-50 dark:bg-blue-900/40 rounded-lg"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => openDelete(m)}
                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 focus:outline-none transition-colors p-2 bg-red-50 dark:bg-red-900/40 rounded-lg"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setError(null);
        }}
        title={editingMed ? "Editar Medicamento" : "Nuevo Medicamento"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg flex items-start gap-2 text-red-700 dark:text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Núm. Autoincremental</label>
              <input 
                type="number" required 
                value={num} onChange={e => setNum(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Clave</label>
              <input 
                type="text" required 
                placeholder="Ej: 010.000.0101.00"
                value={clave} onChange={e => setClave(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</label>
            <input 
              type="text" required 
              value={nombre} onChange={e => setNombre(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</label>
            <textarea 
              rows={2}
              value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Presentación</label>
            <input 
              type="text" 
              value={presentacion} onChange={e => setPresentacion(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border dark:border-gray-800 p-3 rounded-md bg-gray-50 dark:bg-gray-800/50">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Existencia Mes Pasado</label>
              <input 
                type="number" min="0" required
                value={existenciaPasado} onChange={e => setExistenciaPasado(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fecha Existencia</label>
              <input 
                type="date"
                value={fechaExistenciaPasado} onChange={e => setFechaExistenciaPasado(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border dark:border-gray-800 p-3 rounded-md bg-blue-50/50 dark:bg-blue-900/10">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Surtido (Entradas)</label>
              <input 
                type="number" min="0" required
                value={surtido} onChange={e => setSurtido(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fecha de Surtido</label>
              <input 
                type="date"
                value={fechaSurtido} onChange={e => setFechaSurtido(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
              />
            </div>
          </div>

          <div className="border dark:border-gray-800 p-3 rounded-md bg-orange-50/50 dark:bg-orange-900/10">
            <label className="block text-sm font-bold text-orange-900 dark:text-orange-400">Fecha de Caducidad</label>
            <input 
              type="date"
              value={fechaCaducidad} onChange={e => setFechaCaducidad(e.target.value)}
              className="mt-1 block w-full rounded-md border-orange-300 dark:border-orange-800 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
            />
            <p className="text-[10px] text-orange-700 dark:text-orange-300 mt-1">El sistema generará alertas automáticas 3 meses antes de esta fecha.</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Stock Actual Físico (Calculado Automáticamente)</label>
            <div className="mt-1 flex items-center">
              <input 
                type="number" readOnly
                value={stock}
                className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm sm:text-lg font-black p-3 border bg-gray-100 dark:bg-gray-800 text-blue-700 dark:text-blue-400" 
              />
              <span className="ml-3 text-xs text-gray-500 dark:text-gray-400 italic">Mes Pasado + Surtido</span>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirmar Eliminación"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-200">¿Estás seguro de eliminar este medicamento?</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Esta acción ocultará a <strong>{medToDelete?.nombre}</strong> del inventario y de las sugerencias de salida. Los registros históricos se mantendrán intactos.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 dark:bg-red-600 hover:bg-red-700 dark:hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {isDeleting ? 'Eliminando...' : 'Eliminar Medicamento'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import Inventory from './Inventory';
import LogBook from './LogBook';
import MonthlyReport from './MonthlyReport';
import Patients from './Patients';
import { Package, FileText, PieChart, Users } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'logbook' | 'report' | 'patients'>('inventory');

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('inventory')}
            className={cn(
              activeTab === 'inventory'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors whitespace-nowrap'
            )}
          >
            <Package
              className={cn(
                activeTab === 'inventory' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Catálogo e Inventario
          </button>
          <button
            onClick={() => setActiveTab('logbook')}
            className={cn(
              activeTab === 'logbook'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors whitespace-nowrap'
            )}
          >
            <FileText
              className={cn(
                activeTab === 'logbook' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Bitácora de Uso
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={cn(
              activeTab === 'report'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors whitespace-nowrap'
            )}
          >
            <PieChart
              className={cn(
                activeTab === 'report' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Reporte Mensual
          </button>
          <button
            onClick={() => setActiveTab('patients')}
            className={cn(
              activeTab === 'patients'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors whitespace-nowrap'
            )}
          >
            <Users
              className={cn(
                activeTab === 'patients' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Pacientes
          </button>
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-x-hidden">
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'logbook' && <LogBook />}
        {activeTab === 'report' && <MonthlyReport />}
        {activeTab === 'patients' && <Patients />}
      </div>
    </div>
  );
}

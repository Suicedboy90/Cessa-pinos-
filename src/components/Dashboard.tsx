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
        <nav className="-mb-px flex space-x-2 sm:space-x-8 overflow-x-auto no-scrollbar pb-1" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('inventory')}
            className={cn(
              activeTab === 'inventory'
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <Package
              className={cn(
                activeTab === 'inventory' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Inventario
          </button>
          <button
            onClick={() => setActiveTab('logbook')}
            className={cn(
              activeTab === 'logbook'
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <FileText
              className={cn(
                activeTab === 'logbook' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Antibióticos
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={cn(
              activeTab === 'report'
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
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
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <Users
              className={cn(
                activeTab === 'patients' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Sin Expediente
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

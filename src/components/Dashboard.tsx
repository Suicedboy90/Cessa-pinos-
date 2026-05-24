import { useState } from 'react';
import Inventory from './Inventory';
import LogBook from './LogBook';
import MonthlyReport from './MonthlyReport';
import Patients from './Patients';
import StaffManager from './StaffManager';
import { Package, FileText, PieChart, Users, Shield } from 'lucide-react';
import { cn } from '../lib/utils';

interface DashboardProps {
  systemId: string;
  role: 'admin' | 'encargado';
}

export default function Dashboard({ systemId, role }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'logbook' | 'report' | 'patients' | 'staff'>('inventory');

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex space-x-2 sm:space-x-8 overflow-x-auto no-scrollbar pb-1" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('inventory')}
            className={cn(
              activeTab === 'inventory'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <Package
              className={cn(
                activeTab === 'inventory' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Inventario
          </button>
          <button
            onClick={() => setActiveTab('logbook')}
            className={cn(
              activeTab === 'logbook'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <FileText
              className={cn(
                activeTab === 'logbook' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Antibióticos
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={cn(
              activeTab === 'report'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <PieChart
              className={cn(
                activeTab === 'report' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Reporte Mensual
          </button>
          <button
            onClick={() => setActiveTab('patients')}
            className={cn(
              activeTab === 'patients'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
              'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
            )}
          >
            <Users
              className={cn(
                activeTab === 'patients' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400',
                '-ml-0.5 mr-2 h-5 w-5'
              )}
            />
            Sin Expediente
          </button>

          {role === 'admin' && (
            <button
              onClick={() => setActiveTab('staff')}
              className={cn(
                activeTab === 'staff'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
                'group inline-flex items-center border-b-2 py-4 px-3 sm:px-1 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg min-h-[48px]'
              )}
            >
              <Shield
                className={cn(
                  activeTab === 'staff' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400',
                  '-ml-0.5 mr-2 h-5 w-5'
                )}
              />
              Gestionar Encargados
            </button>
          )}
        </nav>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 overflow-x-hidden">
        {activeTab === 'inventory' && <Inventory systemId={systemId} />}
        {activeTab === 'logbook' && <LogBook systemId={systemId} />}
        {activeTab === 'report' && <MonthlyReport systemId={systemId} />}
        {activeTab === 'patients' && <Patients systemId={systemId} />}
        {activeTab === 'staff' && role === 'admin' && <StaffManager systemId={systemId} />}
      </div>
    </div>
  );
}

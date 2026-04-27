import { Title } from "@tremor/react";

export default function AppointmentsPage() {
  return (
    <main className="p-8 space-y-6 max-w-7xl mx-auto">
      <Title className="text-3xl font-bold text-slate-800">Appointments</Title>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <p className="text-slate-600">Appointment calendar and status tracker will be displayed here.</p>
      </div>
    </main>
  );
}

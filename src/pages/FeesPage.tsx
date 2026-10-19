import { useState } from "react";
import { motion } from "framer-motion";
import { MOCK_FEES, FeeRecord } from "@/data/mockData";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatCard from "@/components/dashboard/StatCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, DollarSign, CheckCircle, Clock, AlertTriangle, FileText, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusColors: Record<string, string> = {
  Paid: "bg-success/10 text-success border-success/20",
  Pending: "bg-warning/10 text-warning border-warning/20",
  Overdue: "bg-destructive/10 text-destructive border-destructive/20",
  Partial: "bg-info/10 text-info border-info/20",
};

const FeesPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<FeeRecord | null>(null);

  const filtered = MOCK_FEES.filter((f) => {
    const matchesSearch = `${f.studentName} ${f.invoiceNumber} ${f.studentId}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalCollected = MOCK_FEES.filter((f) => f.status === "Paid").reduce((s, f) => s + f.paidAmount, 0);
  const totalPending = MOCK_FEES.filter((f) => f.status === "Pending" || f.status === "Partial").reduce((s, f) => s + (f.amount - f.paidAmount), 0);
  const totalOverdue = MOCK_FEES.filter((f) => f.status === "Overdue").reduce((s, f) => s + f.amount, 0);

  return (
    <DashboardLayout>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={`$${(totalCollected + totalPending + totalOverdue).toLocaleString()}`} icon={DollarSign} color="primary" change="This term" changeType="neutral" />
        <StatCard title="Collected" value={`$${totalCollected.toLocaleString()}`} icon={CheckCircle} color="success" change={`${MOCK_FEES.filter((f) => f.status === "Paid").length} invoices`} changeType="positive" delay={0.08} />
        <StatCard title="Pending" value={`$${totalPending.toLocaleString()}`} icon={Clock} color="warning" change={`${MOCK_FEES.filter((f) => f.status === "Pending" || f.status === "Partial").length} invoices`} changeType="neutral" delay={0.16} />
        <StatCard title="Overdue" value={`$${totalOverdue.toLocaleString()}`} icon={AlertTriangle} color="destructive" change={`${MOCK_FEES.filter((f) => f.status === "Overdue").length} invoices`} changeType="negative" delay={0.24} />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card">
        <Tabs defaultValue="invoices" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-border">
            <div>
              <h1 className="font-heading text-xl font-bold text-card-foreground">Fees & Payments</h1>
              <p className="text-sm text-muted-foreground">Manage tuition, invoices, and payment tracking</p>
            </div>
            <TabsList>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="fee-structure">Fee Structure</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="invoices" className="mt-0">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border bg-muted/30">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by student, invoice..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["Paid", "Pending", "Overdue", "Partial"].map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1.5" />Export</Button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Invoice</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Student</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden md:table-cell">Type</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Amount</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden md:table-cell">Paid</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Due Date</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((fee, i) => (
                    <motion.tr
                      key={fee.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-card-foreground">{fee.invoiceNumber}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-card-foreground">{fee.studentName}</p>
                        <p className="text-xs text-muted-foreground">{fee.grade}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">{fee.feeType}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-card-foreground text-right">${fee.amount.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground text-right hidden md:table-cell">${fee.paidAmount.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground hidden lg:table-cell">{new Date(fee.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className="px-5 py-3.5"><Badge variant="outline" className={`text-xs ${statusColors[fee.status]}`}>{fee.status}</Badge></td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInvoice(fee)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <FileText className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No invoices found</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="fee-structure" className="mt-0 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { type: "Tuition", amounts: { "9": 2500, "10": 2500, "11": 2800, "12": 3000 }, frequency: "Per Term" },
                { type: "Transport", amounts: { default: 800 }, frequency: "Per Term" },
                { type: "Hostel", amounts: { default: 1200 }, frequency: "Per Term" },
                { type: "Lab Fee", amounts: { default: 150 }, frequency: "Per Term" },
                { type: "Library Fee", amounts: { default: 100 }, frequency: "Annual" },
                { type: "Exam Fee", amounts: { default: 200 }, frequency: "Per Exam" },
              ].map((fee) => (
                <div key={fee.type} className="bg-muted/30 rounded-lg p-4 border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-heading text-sm font-semibold text-card-foreground">{fee.type}</h4>
                    <Badge variant="secondary" className="text-xs">{fee.frequency}</Badge>
                  </div>
                  {'default' in fee.amounts ? (
                    <p className="font-heading text-2xl font-bold text-primary">${(fee.amounts as { default: number }).default}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {Object.entries(fee.amounts).map(([grade, amount]) => (
                        <div key={grade} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Grade {grade}</span>
                          <span className="font-medium text-card-foreground">${amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Invoice Details</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4 border border-border space-y-3">
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Invoice #</span><span className="text-sm font-medium text-card-foreground">{selectedInvoice.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Student</span><span className="text-sm font-medium text-card-foreground">{selectedInvoice.studentName}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Fee Type</span><span className="text-sm text-card-foreground">{selectedInvoice.feeType}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Amount</span><span className="text-sm font-bold text-card-foreground">${selectedInvoice.amount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Paid</span><span className="text-sm text-card-foreground">${selectedInvoice.paidAmount.toLocaleString()}</span></div>
                {selectedInvoice.amount - selectedInvoice.paidAmount > 0 && (
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Balance</span><span className="text-sm font-bold text-destructive">${(selectedInvoice.amount - selectedInvoice.paidAmount).toLocaleString()}</span></div>
                )}
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Due Date</span><span className="text-sm text-card-foreground">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</span></div>
                {selectedInvoice.paidDate && (
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Paid Date</span><span className="text-sm text-card-foreground">{new Date(selectedInvoice.paidDate).toLocaleDateString()}</span></div>
                )}
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Status</span><Badge variant="outline" className={`text-xs ${statusColors[selectedInvoice.status]}`}>{selectedInvoice.status}</Badge></div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline"><Download className="w-4 h-4 mr-1.5" />Download PDF</Button>
                {selectedInvoice.status !== "Paid" && <Button className="flex-1">Record Payment</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default FeesPage;

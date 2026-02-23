import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, PlusCircle, UserPlus, Trash2, Fingerprint, LogOut, FileText, Upload, Download } from 'lucide-react';

import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '@/services/authService';
import { employeeService } from '@/services/employeeService';
import { timeEntryService } from '@/services/timeEntryService';
import { folhaService } from '@/services/folhaService';
import { importacaoService, type ImportacaoDetail, type ImportacaoListItem } from '@/services/importacaoService';
import { getEmbeddingFromCanvas, loadFaceModels, getFaceApi } from '@/lib/faceApi';
import { CameraModal } from '@/components/CameraModal';
import { RECORD_TYPE_LABELS } from '@/types/timeClock';

export function AdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, user, logout, selectedEmpresaId, setSelectedEmpresaId } = useAuth();
  const [formState, setFormState] = useState({ identifier: '', name: '', email: '' });
  const [cameraEmployeeId, setCameraEmployeeId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [pointsFrom, setPointsFrom] = useState('');
  const [pointsTo, setPointsTo] = useState('');
  const [pointsQueryEnabled, setPointsQueryEnabled] = useState(false);
  const [exportingFolha, setExportingFolha] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMesRef, setImportMesRef] = useState('');
  const [selectedImportacaoId, setSelectedImportacaoId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    loadFaceModels().catch((error) => console.error('Erro ao carregar modelos', error));
  }, []);

  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: authService.listEmpresas,
    enabled: isAuthenticated && user?.role === 'ADMIN',
  });

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    const list = empresasQuery.data;
    if (list && list.length > 0 && !selectedEmpresaId) {
      setSelectedEmpresaId(list[0].id);
    }
  }, [user?.role, empresasQuery.data, selectedEmpresaId, setSelectedEmpresaId]);

  const employeesQuery = useQuery({
    queryKey: ['employees', selectedEmpresaId],
    queryFn: employeeService.list,
    enabled: isAuthenticated && !!selectedEmpresaId,
  });

  const latestEntriesQuery = useQuery({
    queryKey: ['time-entries-recent', selectedEmpresaId],
    queryFn: () => timeEntryService.listRecent(10),
    enabled: isAuthenticated && !!selectedEmpresaId,
  });

  const pointsByPeriodQuery = useQuery({
    queryKey: ['time-entries-period', selectedEmpresaId, pointsFrom, pointsTo],
    queryFn: () => timeEntryService.listByPeriod({ from: pointsFrom || undefined, to: pointsTo || undefined, limit: 500 }),
    enabled: isAuthenticated && !!selectedEmpresaId && pointsQueryEnabled,
  });

  const importacoesQuery = useQuery({
    queryKey: ['importacoes', selectedEmpresaId],
    queryFn: () => importacaoService.list(),
    enabled: isAuthenticated && !!selectedEmpresaId,
  });

  const importacaoDetailQuery = useQuery({
    queryKey: ['importacao', selectedImportacaoId],
    queryFn: () => importacaoService.getById(selectedImportacaoId!),
    enabled: !!selectedImportacaoId,
  });

  const uploadImportacao = useMutation({
    mutationFn: (file: File) => importacaoService.upload(file, importMesRef || undefined),
    onSuccess: (data) => {
      toast({ title: 'Arquivo processado', description: `${data?.linhas?.length ?? 0} linhas extraídas. Revise e confirme.` });
      void importacoesQuery.refetch();
      if (data) setSelectedImportacaoId(data.id);
      setImportFile(null);
      setImportMesRef('');
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao processar', description: e.message, variant: 'destructive' });
    },
  });

  const confirmarImportacao = useMutation({
    mutationFn: (id: string) => importacaoService.confirmar(id),
    onSuccess: () => {
      toast({ title: 'Folha consolidada', description: 'Dados enviados para a folha do mês.' });
      setSelectedImportacaoId(null);
      void importacoesQuery.refetch();
      void importacaoDetailQuery.refetch();
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao confirmar', description: e.message, variant: 'destructive' });
    },
  });

  const createEmployee = useMutation({
    mutationFn: employeeService.create,
    onSuccess: () => {
      toast({ title: 'Colaborador cadastrado', variant: 'default' });
      void employeesQuery.refetch();
      setFormState({ identifier: '', name: '', email: '' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' });
    },
  });

  const enrollMutation = useMutation({
    mutationFn: ({ employeeId, embedding }: { employeeId: string; embedding: number[] }) =>
      employeeService.enroll(employeeId, { embeddings: [embedding] }),
    onSuccess: () => {
      toast({ title: 'Biometria registrada', variant: 'default' });
      void employeesQuery.refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao registrar biometria', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: employeeService.remove,
    onSuccess: () => {
      toast({ title: 'Colaborador removido', variant: 'default' });
      void employeesQuery.refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createEmployee.mutate(formState);
  };

  const handleOpenCamera = (employeeId: string) => {
    setCameraEmployeeId(employeeId);
    setIsCameraOpen(true);
  };

  const faceApi = getFaceApi();

  async function blobToCanvas(photo: Blob): Promise<HTMLCanvasElement> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(photo);
    });

    const image = await faceApi.fetchImage(dataUrl);
    const canvas = faceApi.createCanvasFromMedia(image) as HTMLCanvasElement;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    return canvas;
  }

  const handlePhotoConfirm = async (photo: Blob) => {
    if (!cameraEmployeeId) return;

    try {
      const canvas = await blobToCanvas(photo);
      const embedding = await getEmbeddingFromCanvas(canvas);

      if (!embedding || embedding.length === 0) {
        toast({
          title: 'Não foi possível detectar o rosto',
          description: 'Ajuste a iluminação/enquadramento e tente novamente.',
          variant: 'destructive',
        });
        return;
      }

      await enrollMutation.mutateAsync({ employeeId: cameraEmployeeId, embedding });
      setIsCameraOpen(false);
    } catch (error) {
      console.error('Erro ao processar foto:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Envie outro arquivo ou tente novamente.';

      toast({
        title: 'Erro ao processar a foto',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const recentEntries = useMemo(() => latestEntriesQuery.data ?? [], [latestEntriesQuery.data]);
  const empresas = useMemo(() => empresasQuery.data ?? [], [empresasQuery.data]);
  const companyName = user?.role === 'GESTOR'
    ? user.empresa?.name
    : empresas.find((e) => e.id === selectedEmpresaId)?.name ?? '';

  const handleExportFolha = async (format: 'csv' | 'json') => {
    const now = new Date();
    setExportingFolha(true);
    try {
      await folhaService.exportFolha(now.getFullYear(), now.getMonth() + 1, format);
      toast({ title: 'Download iniciado', description: `Folha exportada em ${format.toUpperCase()}.` });
    } catch (e) {
      toast({ title: 'Erro ao exportar', description: e instanceof Error ? e.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setExportingFolha(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {user?.role === 'ADMIN' && empresas.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Empresa</Label>
                <Select
                  value={selectedEmpresaId ?? ''}
                  onValueChange={(id) => setSelectedEmpresaId(id || null)}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {companyName && (
              <span className="text-sm font-medium text-muted-foreground">
                {user?.role === 'GESTOR' ? 'Painel da empresa' : ''} {companyName}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="flex items-center gap-2 ml-auto" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>

        {user?.role === 'ADMIN' && !selectedEmpresaId && empresas.length > 0 && (
          <p className="text-sm text-muted-foreground">Selecione uma empresa para ver colaboradores e batidas.</p>
        )}

        <Tabs defaultValue="colaboradores" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
            <TabsTrigger value="pontos">Relação de pontos</TabsTrigger>
            <TabsTrigger value="folha">Folha e relatórios</TabsTrigger>
            <TabsTrigger value="importar">Importar folha</TabsTrigger>
          </TabsList>

          <TabsContent value="colaboradores" className="space-y-8 mt-6">
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Cadastro de colaborador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="identifier">ID interno / matrícula</Label>
                  <Input
                    id="identifier"
                    value={formState.identifier}
                    onChange={(e) => setFormState((prev) => ({ ...prev, identifier: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    value={formState.name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={createEmployee.isPending || !selectedEmpresaId}
                  className="w-full"
                >
                  {createEmployee.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <PlusCircle className="w-4 h-5" /> Adicionar colaborador
                    </span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Últimas batidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[360px] overflow-auto">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between border rounded-xl px-4 py-2">
                  <div>
                    <p className="font-semibold">{entry.employee?.name ?? entry.employeeId}</p>
                    <p className="text-sm text-muted-foreground">
                      {RECORD_TYPE_LABELS[entry.type]} ·{' '}
                      {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                  <Fingerprint className="w-4 h-4 text-primary" />
                </div>
              ))}
              {!recentEntries.length && (
                <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Colaboradores cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Biometrias</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeesQuery.data?.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.identifier}</TableCell>
                    <TableCell>{employee.embeddingsCount ?? 0}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleOpenCamera(employee.id)}>
                        Capturar rosto
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(employee.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!employeesQuery.data?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhum colaborador cadastrado ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="pontos" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Relação de pontos registrados</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Defina o período e clique em Buscar para ver todos os registros de ponto da empresa.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-2">
                    <Label>Data inicial</Label>
                    <Input
                      type="date"
                      value={pointsFrom}
                      onChange={(e) => setPointsFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data final</Label>
                    <Input
                      type="date"
                      value={pointsTo}
                      onChange={(e) => setPointsTo(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={() => setPointsQueryEnabled(true)}
                    disabled={!selectedEmpresaId}
                  >
                    Buscar
                  </Button>
                </div>
                {pointsQueryEnabled && (
                  <div className="rounded-md border overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colaborador</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Data e hora</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(pointsByPeriodQuery.data ?? []).map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{entry.employee?.name ?? entry.employeeId}</TableCell>
                            <TableCell>{RECORD_TYPE_LABELS[entry.type]}</TableCell>
                            <TableCell>{new Date(entry.timestamp).toLocaleString('pt-BR')}</TableCell>
                          </TableRow>
                        ))}
                        {pointsByPeriodQuery.isLoading && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </TableCell>
                          </TableRow>
                        )}
                        {pointsByPeriodQuery.isSuccess && !(pointsByPeriodQuery.data?.length) && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                              Nenhum registro no período.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="folha" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Folha e relatórios
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Exporte a consolidação mensal da folha de pagamento (mês atual) para CSV ou JSON.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleExportFolha('csv')}
                  disabled={!selectedEmpresaId || exportingFolha}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar folha (CSV)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExportFolha('json')}
                  disabled={!selectedEmpresaId || exportingFolha}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar folha (JSON)
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="importar" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Enviar documento
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  PDF, XLSX, CSV ou imagem (PNG/JPG). O sistema extrai o conteúdo e normaliza para a folha. Opcional: defina o mês de referência (YYYY-MM).
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Arquivo</Label>
                  <Input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mês referência (opcional)</Label>
                  <Input
                    type="month"
                    value={importMesRef}
                    onChange={(e) => setImportMesRef(e.target.value)}
                    className="w-[180px]"
                  />
                </div>
                <Button
                  disabled={!importFile || !selectedEmpresaId || uploadImportacao.isPending}
                  onClick={() => importFile && uploadImportacao.mutate(importFile)}
                >
                  {uploadImportacao.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar e processar'}
                </Button>
              </CardContent>
            </Card>

            {selectedImportacaoId && importacaoDetailQuery.data && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Revisar importação</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Mês: {importacaoDetailQuery.data.mesReferencia} · {importacaoDetailQuery.data.linhas.length} linhas · Status: {importacaoDetailQuery.data.status}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedImportacaoId(null)}>
                    Voltar à lista
                  </Button>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <div className="rounded-md border max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colaborador</TableHead>
                          <TableHead>Horas 60%</TableHead>
                          <TableHead>Horas 100%</TableHead>
                          <TableHead>Noturno</TableHead>
                          <TableHead>Desconto</TableHead>
                          <TableHead>Observação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importacaoDetailQuery.data.linhas.map((linha) => (
                          <TableRow key={linha.id}>
                            <TableCell>{linha.colaborador}</TableCell>
                            <TableCell>{linha.horas60 ?? '—'}</TableCell>
                            <TableCell>{linha.horas100 ?? '—'}</TableCell>
                            <TableCell>{linha.noturno ?? '—'}</TableCell>
                            <TableCell>{linha.desconto ?? '—'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{linha.observacao ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {importacaoDetailQuery.data.status === 'REVISAO' && (
                    <Button
                      className="mt-4"
                      onClick={() => confirmarImportacao.mutate(selectedImportacaoId)}
                      disabled={confirmarImportacao.isPending}
                    >
                      {confirmarImportacao.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Confirmar e consolidar na folha
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Importações recentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-auto max-h-[280px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Linhas</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(importacoesQuery.data ?? []).map((imp: ImportacaoListItem) => (
                        <TableRow key={imp.id}>
                          <TableCell>{imp.mesReferencia}</TableCell>
                          <TableCell>{imp.tipo}</TableCell>
                          <TableCell>{imp.status}</TableCell>
                          <TableCell>{imp.linhasCount}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedImportacaoId(imp.id)}
                            >
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {importacoesQuery.isSuccess && !(importacoesQuery.data?.length) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            Nenhuma importação ainda. Envie um arquivo acima.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onConfirm={handlePhotoConfirm}
        recordTypeLabel="Cadastro biométrico"
      />
    </div>
  );
}

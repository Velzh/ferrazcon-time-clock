import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, PlusCircle, UserPlus, Trash2, Fingerprint, Lock, LogOut } from 'lucide-react';

import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { employeeService } from '@/services/employeeService';
import { timeEntryService } from '@/services/timeEntryService';
import { getEmbeddingFromCanvas, loadFaceModels, getFaceApi } from '@/lib/faceApi';
import { CameraModal } from '@/components/CameraModal';
import { RECORD_TYPE_LABELS } from '@/types/timeClock';

const ADMIN_EMAIL = 'contabilidadefzc@gmail.com';
const ADMIN_PASSWORD = 'Fe#@rAz65co*&n0Con1!$tabil';
const ADMIN_STORAGE_KEY = 'fzc-admin-auth';

export function AdminPage() {
  const { toast } = useToast();
  const [formState, setFormState] = useState({ identifier: '', name: '', email: '' });
  const [cameraEmployeeId, setCameraEmployeeId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem(ADMIN_STORAGE_KEY) === 'true');
  const [loginState, setLoginState] = useState({ email: '', password: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    loadFaceModels().catch((error) => console.error('Erro ao carregar modelos', error));
  }, []);

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: employeeService.list,
  });

  const latestEntriesQuery = useQuery({
    queryKey: ['time-entries-recent'],
    queryFn: () => timeEntryService.listRecent(10),
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
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Envie outro arquivo ou tente novamente.';
      
      toast({
        title: 'Erro ao processar a foto',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const recentEntries = useMemo(() => latestEntriesQuery.data ?? [], [latestEntriesQuery.data]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setTimeout(() => {
      if (loginState.email.trim().toLowerCase() === ADMIN_EMAIL && loginState.password === ADMIN_PASSWORD) {
        localStorage.setItem(ADMIN_STORAGE_KEY, 'true');
        setIsAuthenticated(true);
        toast({ title: 'Bem-vindo!', description: 'Painel administrativo liberado.' });
      } else {
        toast({ title: 'Credenciais inválidas', description: 'Verifique e tente novamente.', variant: 'destructive' });
      }
      setIsLoggingIn(false);
    }, 300);
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    setIsAuthenticated(false);
    setLoginState({ email: '', password: '' });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-2xl border-none bg-white/95 backdrop-blur">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Área restrita</CardTitle>
            <p className="text-muted-foreground text-sm">
              Faça login com as credenciais fornecidas pela Ferrazcon Contabilidade.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-email">E-mail corporativo</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={loginState.email}
                  onChange={(e) => setLoginState((prev) => ({ ...prev, email: e.target.value }))}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password">Senha</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={loginState.password}
                  onChange={(e) => setLoginState((prev) => ({ ...prev, password: e.target.value }))}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
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
                <Button type="submit" disabled={createEmployee.isPending} className="w-full">
                  {createEmployee.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <PlusCircle className="w-4 h-4" /> Adicionar colaborador
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
                      {RECORD_TYPE_LABELS[entry.type]} · {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                  <Fingerprint className="w-4 h-4 text-primary" />
                </div>
              ))}
              {!recentEntries.length && <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>}
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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handle = async (action) => {
    setLoading(true);
    setError('');
    setMessage('');
    // Dev shorthand: "testaccount" maps to the seeded test user
    const resolvedEmail = email.trim() === 'testaccount' ? 'testaccount@gmail.com' : email.trim();
    try {
      const { error: err } = action === 'login'
        ? await signIn(resolvedEmail, password)
        : await signUp(resolvedEmail, password);
      if (err) throw err;
      if (action === 'login') navigate('/library');
      else setMessage('Check your email to confirm your account.');
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Boox Reader</h1>
          <p className="text-sm text-muted-foreground">Your personal reading library</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">Register</TabsTrigger>
          </TabsList>

          {['login', 'register'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">{tab === 'login' ? 'Welcome back' : 'Create account'}</CardTitle>
                  <CardDescription className="text-xs">
                    {tab === 'login' ? 'Sign in to access your library' : 'Start building your reading list'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${tab}-email`}>Email</Label>
                    <Input id={`${tab}-email`} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${tab}-password`}>Password</Label>
                    <Input id={`${tab}-password`} type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handle(tab)} />
                  </div>
                  {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                  {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
                  <Button className="w-full" disabled={loading} onClick={() => handle(tab)}>
                    {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

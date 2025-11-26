import { Header } from "@/components/Header";
import { TimeClockCard } from "@/components/TimeClockCard";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 md:py-12 flex items-center justify-center">
        <TimeClockCard />
      </main>
    </div>
  );
};

export default Index;

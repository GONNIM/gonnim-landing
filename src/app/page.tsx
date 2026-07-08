import { Hero } from "@/components/sections/Hero";
import { Impact } from "@/components/sections/Impact";

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <Hero />
      <Impact />
    </main>
  );
}

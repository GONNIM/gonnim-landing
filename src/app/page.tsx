import { About } from "@/components/sections/About";
import { Contact } from "@/components/sections/Contact";
import { Hero } from "@/components/sections/Hero";
import { Impact } from "@/components/sections/Impact";
import { Products } from "@/components/sections/Products";
import { Services } from "@/components/sections/Services";
import { Tech } from "@/components/sections/Tech";
import { Testimonial } from "@/components/sections/Testimonial";

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <Hero />
      <Impact />
      <About />
      <Products />
      <Services />
      <Tech />
      <Testimonial />
      <Contact />
    </main>
  );
}

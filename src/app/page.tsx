import { Suspense } from "react";
import type { Metadata } from "next";
import { Header } from "@/presentation/components/Header";
import { SocialFooter } from "@/presentation/components/SocialFooter";
import { HomepagePhotos } from "./_components/HomepagePhotos";
import { HomepagePhotosSkeleton } from "./_components/HomepagePhotosSkeleton";

export const revalidate = 300;

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "A photography portfolio",
  openGraph: {
    title: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
    description:
      process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "A photography portfolio",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense fallback={<HomepagePhotosSkeleton />}>
          <HomepagePhotos />
        </Suspense>
      </main>
      <SocialFooter />
    </>
  );
}

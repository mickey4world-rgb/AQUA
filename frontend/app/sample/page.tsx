import ShowcaseShell from "@/components/showcase/ShowcaseShell";
import StudioShowcase from "@/components/showcase/StudioShowcase";

export const metadata = {
  title: "AQUA Studio Showcase",
  description:
    "AQUA STUDIO の6モジュール — サンキー図、訴訟記録、AI合議、保有株、ディズニー、小惑星3D — を認証なしで体感できるショーケース。",
};

export default function SamplePage() {
  return (
    <ShowcaseShell>
      <StudioShowcase />
    </ShowcaseShell>
  );
}

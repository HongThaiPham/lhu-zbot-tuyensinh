export const metadata = {
  title: 'LHU Admin',
  description: 'LHU Admissions admin dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

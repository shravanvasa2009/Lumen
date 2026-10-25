// Lock-screen strings join name and status with a middle dot; the previews draw them on separate lines.
export function lockTextLines(text: string): { name: string; status: string } {
  const [name = '', ...rest] = text.split(' · ');
  return { name, status: rest.join(' · ') };
}

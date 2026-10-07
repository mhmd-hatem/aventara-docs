// Model excerpts for the local simulations. User matches the getting-started schema.
export const userSchema = `model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}`;

export const transactionSchema = `model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}`;

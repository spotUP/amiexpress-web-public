// Type declarations for inquirer (legacy CommonJS version)
declare module 'inquirer' {
  interface Question {
    type?: string;
    name: string;
    message: string;
    choices?: Array<string | { name: string; value: any }>;
    default?: any;
    validate?: (input: any) => boolean | string | Promise<boolean | string>;
    filter?: (input: any) => any;
    when?: boolean | ((answers: any) => boolean | Promise<boolean>);
  }

  interface Answers {
    [key: string]: any;
  }

  interface PromptModule {
    (questions: Question | Question[]): Promise<Answers>;
  }

  const prompt: PromptModule;
  export default { prompt };
}

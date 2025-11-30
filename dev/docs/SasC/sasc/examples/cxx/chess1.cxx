// Copyright (c) 1993 SAS Institute, Inc, Cary, NC USA
// All Rights Reserved
//
// This c++ example is a very basic chess program.
// This version contains a logic error that will
// be found with the CodeProbe debugger.

#include <iostream.h>
#include <string.h>

class chessPiece {
   char name[10];          // full name of the piece
   char color;             // is it white or black
   char code;              // display abbreviation 
   int value;              // value of piece in points

public:
  chessPiece(const char *n, char c, char co, int v) {
    // construct and initialize a chess piece
    strcpy(name, n);
    color = c;
    code = co;
    value = v;
  }

  void showPiece() {
    // display the piece to the user
    cout << "| " << color << code << "  ";
  }

};

class chessBoard {
   class chessPiece *board[8][8];  // the chess board
public:
   chessBoard();
   ~chessBoard();

   void showBoard();
   void movePiece(int old_r, int old_c, int new_r, int new_c);
};

chessBoard::chessBoard(){
  // Take out the pieces and setup the board
  int r,c;

  for (r=0; r<8; r++) 
    for (c=0; c<8; c++)
      board[r][c] = NULL;

  for (c=0; c<8; c++) {
     board[1][c] = new chessPiece ("pawn", 'w', 'P', 1);
     board[6][c] = new chessPiece ("pawn", 'b', 'P', 1);
  }

  board[0][0] = new chessPiece ("rook", 'w', 'R', 5);
  board[0][7] = new chessPiece ("rook", 'w', 'R', 5);
  board[7][0] = new chessPiece ("rook", 'b', 'R', 5);
  board[7][7] = new chessPiece ("rook", 'b', 'R', 5);

  board[0][1] = new chessPiece ("knight", 'w', 'N', 3);
  board[0][6] = new chessPiece ("knight", 'w', 'N', 3);
  board[7][1] = new chessPiece ("knight", 'b', 'N', 3);
  board[7][6] = new chessPiece ("knight", 'b', 'N', 3);

  board[0][2] = new chessPiece ("bishop", 'w', 'B', 3);
  board[0][5] = new chessPiece ("bishop", 'w', 'B', 3);
  board[7][2] = new chessPiece ("bishop", 'b', 'B', 3);
  board[7][5] = new chessPiece ("bishop", 'b', 'B', 3);

  board[0][3] = new chessPiece ("queen", 'w', 'Q', 9);
  board[7][3] = new chessPiece ("queen", 'b', 'Q', 9);

  board[0][4] = new chessPiece ("king", 'w', 'K', 3);
  board[7][4] = new chessPiece ("king", 'b', 'K', 3);
}

chessBoard::~chessBoard(){
  // put the pieces back in the box
  int r, c; 
  for (r=0; r<8; r++) 
    for (c=0; c<8; c++)
      delete board[r][c];
}

void chessBoard::movePiece(int old_r, int old_c, int new_r, int new_c) {
  // perform a simple piece move

  // !!!this statement contains a logic error!!!
  board[new_c][new_r] = board[old_r][old_c];

  board[old_r][old_c] = NULL;
} 

void chessBoard::showBoard() {
  // display the chess board as a grid containing
  // the pieces in their current position.       
  int r,c;

  for (r=7; r>=0; r--) {
    cout << "-------------------------------------------------" << endl;
    for (c=0; c<8; c++)
      if (board[r][c] != NULL)
         board[r][c]->showPiece();
      else cout << "|     ";
    cout << '|' << endl;

  }
  cout << "------------------------------------------------" << endl;
}


int main () {

  class chessBoard gameboard;  // constructs and setups up the pieces

  // start the game with the Sicilian opening
  gameboard.movePiece(1,4, 3,4);
  gameboard.movePiece(6,2, 4,2);
  gameboard.movePiece(0,6, 2,5);
  gameboard.movePiece(7,1, 5,2);

  // display the board to the user
  gameboard.showBoard();

  // the game board and chess pieces are automatically 
  // (put away) destructed

  return 0;

}












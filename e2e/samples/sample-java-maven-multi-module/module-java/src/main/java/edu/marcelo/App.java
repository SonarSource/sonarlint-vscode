package edu.marcelo;

/**
 * Hello world!
 *
 */
public class App 
{
    public static void main( String[] args ) throws MyException
    {
        System.out.println( "Hello World!" );
    }

    private static final class MyException extends Exception {}
}

/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package servlets;

import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import static java.lang.System.out;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * @author VivianaAndrea
 */
@WebServlet(name = "EscribirAlFinalDelFichero", urlPatterns = {"/EscribirAlFinalDelFichero"})

public class EscribirAlFinalDelFichero extends HttpServlet {

    protected void processRequest(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
    }

    /**
     * Handles the HTTP <code>GET</code> method.
     *
     * @param request servlet request
     * @param response servlet response
     * @throws ServletException if a servlet-specific error occurs
     * @throws IOException if an I/O error occurs
     */
    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        
            //Tipo de contenido de la respuesta
            response.setContentType("text/html;charset=UTF-8");
            //Se escriben los datos de la respuesta
            PrintWriter out = response.getWriter();
            out.println("<!DOCTYPE html>");
            out.println("<html>");
            out.println("<head>");
            out.println("<title>Servlet</title>");            
            out.println("</head>");
            out.println("<body>");
            out.println("<h1>Se guardó: 'ArchivoDeTextoServlet.txt'.</h1>");
            out.println("</body>");
            out.println("</html>");
        
            try {
                FileWriter fs = new FileWriter("../ArchivoDeTextoServlet.txt", true);
                BufferedWriter bw = new BufferedWriter(fs);
                bw.write("Hello World! ");
                bw.newLine();
                bw.close();
            } 
            catch (IOException ex) 
            {
                System.out.println("Error: "+ex.getMessage());
            }
            out.close();
    }


    
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        processRequest(request, response);
    }

    /**
     * Returns a short description of the servlet.
     *
     * @return a String containing servlet description
     */
    @Override
    public String getServletInfo() {
        return "Short description";
    }// </editor-fold>

}

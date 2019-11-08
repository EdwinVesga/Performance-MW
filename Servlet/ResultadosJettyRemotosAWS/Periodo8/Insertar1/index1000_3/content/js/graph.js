/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 167.0, "minX": 0.0, "maxY": 4529.0, "series": [{"data": [[0.0, 167.0], [0.1, 184.0], [0.2, 194.0], [0.3, 194.0], [0.4, 202.0], [0.5, 212.0], [0.6, 221.0], [0.7, 225.0], [0.8, 225.0], [0.9, 225.0], [1.0, 226.0], [1.1, 231.0], [1.2, 231.0], [1.3, 234.0], [1.4, 234.0], [1.5, 234.0], [1.6, 236.0], [1.7, 236.0], [1.8, 238.0], [1.9, 238.0], [2.0, 240.0], [2.1, 240.0], [2.2, 240.0], [2.3, 241.0], [2.4, 241.0], [2.5, 244.0], [2.6, 244.0], [2.7, 244.0], [2.8, 245.0], [2.9, 246.0], [3.0, 246.0], [3.1, 249.0], [3.2, 250.0], [3.3, 250.0], [3.4, 251.0], [3.5, 252.0], [3.6, 253.0], [3.7, 253.0], [3.8, 254.0], [3.9, 255.0], [4.0, 256.0], [4.1, 256.0], [4.2, 259.0], [4.3, 260.0], [4.4, 261.0], [4.5, 262.0], [4.6, 262.0], [4.7, 262.0], [4.8, 262.0], [4.9, 263.0], [5.0, 263.0], [5.1, 263.0], [5.2, 264.0], [5.3, 264.0], [5.4, 264.0], [5.5, 264.0], [5.6, 265.0], [5.7, 266.0], [5.8, 266.0], [5.9, 266.0], [6.0, 266.0], [6.1, 266.0], [6.2, 267.0], [6.3, 268.0], [6.4, 268.0], [6.5, 270.0], [6.6, 271.0], [6.7, 271.0], [6.8, 271.0], [6.9, 274.0], [7.0, 275.0], [7.1, 276.0], [7.2, 276.0], [7.3, 277.0], [7.4, 278.0], [7.5, 278.0], [7.6, 279.0], [7.7, 279.0], [7.8, 280.0], [7.9, 280.0], [8.0, 282.0], [8.1, 282.0], [8.2, 283.0], [8.3, 284.0], [8.4, 284.0], [8.5, 286.0], [8.6, 286.0], [8.7, 286.0], [8.8, 286.0], [8.9, 287.0], [9.0, 287.0], [9.1, 289.0], [9.2, 289.0], [9.3, 289.0], [9.4, 290.0], [9.5, 291.0], [9.6, 292.0], [9.7, 293.0], [9.8, 293.0], [9.9, 294.0], [10.0, 295.0], [10.1, 295.0], [10.2, 295.0], [10.3, 297.0], [10.4, 299.0], [10.5, 301.0], [10.6, 301.0], [10.7, 303.0], [10.8, 303.0], [10.9, 303.0], [11.0, 303.0], [11.1, 304.0], [11.2, 304.0], [11.3, 305.0], [11.4, 305.0], [11.5, 306.0], [11.6, 307.0], [11.7, 307.0], [11.8, 307.0], [11.9, 308.0], [12.0, 310.0], [12.1, 311.0], [12.2, 311.0], [12.3, 312.0], [12.4, 314.0], [12.5, 315.0], [12.6, 316.0], [12.7, 316.0], [12.8, 317.0], [12.9, 317.0], [13.0, 318.0], [13.1, 319.0], [13.2, 319.0], [13.3, 319.0], [13.4, 319.0], [13.5, 322.0], [13.6, 323.0], [13.7, 323.0], [13.8, 323.0], [13.9, 324.0], [14.0, 326.0], [14.1, 327.0], [14.2, 328.0], [14.3, 328.0], [14.4, 329.0], [14.5, 333.0], [14.6, 335.0], [14.7, 337.0], [14.8, 338.0], [14.9, 341.0], [15.0, 342.0], [15.1, 344.0], [15.2, 344.0], [15.3, 347.0], [15.4, 348.0], [15.5, 348.0], [15.6, 349.0], [15.7, 350.0], [15.8, 350.0], [15.9, 350.0], [16.0, 354.0], [16.1, 354.0], [16.2, 356.0], [16.3, 356.0], [16.4, 360.0], [16.5, 361.0], [16.6, 362.0], [16.7, 363.0], [16.8, 363.0], [16.9, 366.0], [17.0, 368.0], [17.1, 368.0], [17.2, 369.0], [17.3, 372.0], [17.4, 372.0], [17.5, 375.0], [17.6, 377.0], [17.7, 378.0], [17.8, 380.0], [17.9, 381.0], [18.0, 382.0], [18.1, 382.0], [18.2, 383.0], [18.3, 383.0], [18.4, 384.0], [18.5, 387.0], [18.6, 387.0], [18.7, 388.0], [18.8, 391.0], [18.9, 396.0], [19.0, 397.0], [19.1, 402.0], [19.2, 402.0], [19.3, 403.0], [19.4, 404.0], [19.5, 409.0], [19.6, 420.0], [19.7, 425.0], [19.8, 433.0], [19.9, 434.0], [20.0, 441.0], [20.1, 448.0], [20.2, 450.0], [20.3, 452.0], [20.4, 454.0], [20.5, 457.0], [20.6, 457.0], [20.7, 461.0], [20.8, 462.0], [20.9, 464.0], [21.0, 467.0], [21.1, 467.0], [21.2, 469.0], [21.3, 472.0], [21.4, 474.0], [21.5, 479.0], [21.6, 483.0], [21.7, 483.0], [21.8, 484.0], [21.9, 491.0], [22.0, 492.0], [22.1, 494.0], [22.2, 495.0], [22.3, 495.0], [22.4, 497.0], [22.5, 499.0], [22.6, 500.0], [22.7, 502.0], [22.8, 502.0], [22.9, 503.0], [23.0, 505.0], [23.1, 505.0], [23.2, 506.0], [23.3, 506.0], [23.4, 506.0], [23.5, 509.0], [23.6, 512.0], [23.7, 512.0], [23.8, 514.0], [23.9, 522.0], [24.0, 523.0], [24.1, 529.0], [24.2, 529.0], [24.3, 531.0], [24.4, 534.0], [24.5, 535.0], [24.6, 535.0], [24.7, 536.0], [24.8, 538.0], [24.9, 541.0], [25.0, 545.0], [25.1, 551.0], [25.2, 557.0], [25.3, 561.0], [25.4, 564.0], [25.5, 571.0], [25.6, 574.0], [25.7, 577.0], [25.8, 578.0], [25.9, 581.0], [26.0, 582.0], [26.1, 588.0], [26.2, 590.0], [26.3, 596.0], [26.4, 596.0], [26.5, 598.0], [26.6, 599.0], [26.7, 599.0], [26.8, 600.0], [26.9, 600.0], [27.0, 602.0], [27.1, 605.0], [27.2, 606.0], [27.3, 606.0], [27.4, 609.0], [27.5, 615.0], [27.6, 617.0], [27.7, 617.0], [27.8, 619.0], [27.9, 622.0], [28.0, 624.0], [28.1, 629.0], [28.2, 629.0], [28.3, 631.0], [28.4, 631.0], [28.5, 635.0], [28.6, 642.0], [28.7, 643.0], [28.8, 644.0], [28.9, 644.0], [29.0, 646.0], [29.1, 647.0], [29.2, 648.0], [29.3, 648.0], [29.4, 649.0], [29.5, 650.0], [29.6, 650.0], [29.7, 652.0], [29.8, 656.0], [29.9, 656.0], [30.0, 657.0], [30.1, 657.0], [30.2, 663.0], [30.3, 669.0], [30.4, 673.0], [30.5, 677.0], [30.6, 689.0], [30.7, 692.0], [30.8, 693.0], [30.9, 694.0], [31.0, 696.0], [31.1, 697.0], [31.2, 698.0], [31.3, 700.0], [31.4, 701.0], [31.5, 701.0], [31.6, 702.0], [31.7, 703.0], [31.8, 703.0], [31.9, 703.0], [32.0, 704.0], [32.1, 705.0], [32.2, 705.0], [32.3, 706.0], [32.4, 710.0], [32.5, 717.0], [32.6, 719.0], [32.7, 719.0], [32.8, 723.0], [32.9, 729.0], [33.0, 730.0], [33.1, 731.0], [33.2, 735.0], [33.3, 736.0], [33.4, 742.0], [33.5, 744.0], [33.6, 745.0], [33.7, 746.0], [33.8, 748.0], [33.9, 749.0], [34.0, 750.0], [34.1, 752.0], [34.2, 754.0], [34.3, 755.0], [34.4, 759.0], [34.5, 760.0], [34.6, 761.0], [34.7, 765.0], [34.8, 766.0], [34.9, 767.0], [35.0, 769.0], [35.1, 776.0], [35.2, 778.0], [35.3, 783.0], [35.4, 787.0], [35.5, 789.0], [35.6, 790.0], [35.7, 791.0], [35.8, 792.0], [35.9, 797.0], [36.0, 798.0], [36.1, 801.0], [36.2, 801.0], [36.3, 803.0], [36.4, 805.0], [36.5, 805.0], [36.6, 806.0], [36.7, 807.0], [36.8, 808.0], [36.9, 810.0], [37.0, 811.0], [37.1, 815.0], [37.2, 816.0], [37.3, 826.0], [37.4, 832.0], [37.5, 833.0], [37.6, 836.0], [37.7, 837.0], [37.8, 840.0], [37.9, 844.0], [38.0, 844.0], [38.1, 847.0], [38.2, 849.0], [38.3, 850.0], [38.4, 851.0], [38.5, 854.0], [38.6, 856.0], [38.7, 856.0], [38.8, 857.0], [38.9, 858.0], [39.0, 858.0], [39.1, 863.0], [39.2, 863.0], [39.3, 864.0], [39.4, 867.0], [39.5, 868.0], [39.6, 869.0], [39.7, 874.0], [39.8, 879.0], [39.9, 887.0], [40.0, 891.0], [40.1, 891.0], [40.2, 892.0], [40.3, 892.0], [40.4, 893.0], [40.5, 907.0], [40.6, 912.0], [40.7, 913.0], [40.8, 915.0], [40.9, 915.0], [41.0, 916.0], [41.1, 922.0], [41.2, 922.0], [41.3, 927.0], [41.4, 929.0], [41.5, 931.0], [41.6, 936.0], [41.7, 940.0], [41.8, 948.0], [41.9, 952.0], [42.0, 959.0], [42.1, 959.0], [42.2, 961.0], [42.3, 968.0], [42.4, 969.0], [42.5, 969.0], [42.6, 970.0], [42.7, 971.0], [42.8, 974.0], [42.9, 985.0], [43.0, 996.0], [43.1, 999.0], [43.2, 1001.0], [43.3, 1002.0], [43.4, 1011.0], [43.5, 1018.0], [43.6, 1018.0], [43.7, 1021.0], [43.8, 1022.0], [43.9, 1030.0], [44.0, 1030.0], [44.1, 1031.0], [44.2, 1039.0], [44.3, 1040.0], [44.4, 1041.0], [44.5, 1043.0], [44.6, 1044.0], [44.7, 1044.0], [44.8, 1045.0], [44.9, 1049.0], [45.0, 1050.0], [45.1, 1050.0], [45.2, 1052.0], [45.3, 1053.0], [45.4, 1054.0], [45.5, 1058.0], [45.6, 1061.0], [45.7, 1067.0], [45.8, 1074.0], [45.9, 1079.0], [46.0, 1083.0], [46.1, 1096.0], [46.2, 1097.0], [46.3, 1100.0], [46.4, 1102.0], [46.5, 1103.0], [46.6, 1108.0], [46.7, 1112.0], [46.8, 1118.0], [46.9, 1118.0], [47.0, 1121.0], [47.1, 1123.0], [47.2, 1142.0], [47.3, 1142.0], [47.4, 1144.0], [47.5, 1178.0], [47.6, 1182.0], [47.7, 1197.0], [47.8, 1204.0], [47.9, 1211.0], [48.0, 1213.0], [48.1, 1214.0], [48.2, 1224.0], [48.3, 1240.0], [48.4, 1265.0], [48.5, 1318.0], [48.6, 1358.0], [48.7, 1404.0], [48.8, 1503.0], [48.9, 1606.0], [49.0, 1635.0], [49.1, 1642.0], [49.2, 1685.0], [49.3, 1704.0], [49.4, 1765.0], [49.5, 1779.0], [49.6, 1784.0], [49.7, 1806.0], [49.8, 1808.0], [49.9, 1816.0], [50.0, 1825.0], [50.1, 1833.0], [50.2, 1837.0], [50.3, 1838.0], [50.4, 1838.0], [50.5, 1843.0], [50.6, 1846.0], [50.7, 1847.0], [50.8, 1851.0], [50.9, 1851.0], [51.0, 1859.0], [51.1, 1867.0], [51.2, 1869.0], [51.3, 1871.0], [51.4, 1872.0], [51.5, 1873.0], [51.6, 1875.0], [51.7, 1883.0], [51.8, 1901.0], [51.9, 1904.0], [52.0, 1910.0], [52.1, 1914.0], [52.2, 1917.0], [52.3, 1924.0], [52.4, 1931.0], [52.5, 1932.0], [52.6, 1940.0], [52.7, 1946.0], [52.8, 1952.0], [52.9, 1955.0], [53.0, 1955.0], [53.1, 1957.0], [53.2, 1961.0], [53.3, 1963.0], [53.4, 1972.0], [53.5, 1983.0], [53.6, 1984.0], [53.7, 1992.0], [53.8, 1995.0], [53.9, 2007.0], [54.0, 2008.0], [54.1, 2012.0], [54.2, 2014.0], [54.3, 2017.0], [54.4, 2017.0], [54.5, 2018.0], [54.6, 2018.0], [54.7, 2024.0], [54.8, 2028.0], [54.9, 2031.0], [55.0, 2034.0], [55.1, 2037.0], [55.2, 2042.0], [55.3, 2043.0], [55.4, 2054.0], [55.5, 2056.0], [55.6, 2056.0], [55.7, 2059.0], [55.8, 2061.0], [55.9, 2063.0], [56.0, 2064.0], [56.1, 2069.0], [56.2, 2072.0], [56.3, 2077.0], [56.4, 2084.0], [56.5, 2085.0], [56.6, 2086.0], [56.7, 2089.0], [56.8, 2093.0], [56.9, 2094.0], [57.0, 2097.0], [57.1, 2103.0], [57.2, 2103.0], [57.3, 2104.0], [57.4, 2106.0], [57.5, 2108.0], [57.6, 2115.0], [57.7, 2121.0], [57.8, 2124.0], [57.9, 2126.0], [58.0, 2134.0], [58.1, 2138.0], [58.2, 2144.0], [58.3, 2147.0], [58.4, 2148.0], [58.5, 2149.0], [58.6, 2150.0], [58.7, 2151.0], [58.8, 2155.0], [58.9, 2159.0], [59.0, 2163.0], [59.1, 2172.0], [59.2, 2177.0], [59.3, 2178.0], [59.4, 2179.0], [59.5, 2182.0], [59.6, 2193.0], [59.7, 2196.0], [59.8, 2200.0], [59.9, 2201.0], [60.0, 2209.0], [60.1, 2210.0], [60.2, 2215.0], [60.3, 2220.0], [60.4, 2220.0], [60.5, 2222.0], [60.6, 2226.0], [60.7, 2233.0], [60.8, 2234.0], [60.9, 2235.0], [61.0, 2241.0], [61.1, 2242.0], [61.2, 2243.0], [61.3, 2246.0], [61.4, 2253.0], [61.5, 2256.0], [61.6, 2257.0], [61.7, 2258.0], [61.8, 2276.0], [61.9, 2280.0], [62.0, 2281.0], [62.1, 2283.0], [62.2, 2294.0], [62.3, 2295.0], [62.4, 2297.0], [62.5, 2298.0], [62.6, 2301.0], [62.7, 2304.0], [62.8, 2305.0], [62.9, 2306.0], [63.0, 2314.0], [63.1, 2316.0], [63.2, 2328.0], [63.3, 2330.0], [63.4, 2334.0], [63.5, 2344.0], [63.6, 2355.0], [63.7, 2357.0], [63.8, 2357.0], [63.9, 2363.0], [64.0, 2364.0], [64.1, 2364.0], [64.2, 2369.0], [64.3, 2373.0], [64.4, 2374.0], [64.5, 2376.0], [64.6, 2377.0], [64.7, 2382.0], [64.8, 2383.0], [64.9, 2383.0], [65.0, 2383.0], [65.1, 2385.0], [65.2, 2387.0], [65.3, 2387.0], [65.4, 2394.0], [65.5, 2394.0], [65.6, 2397.0], [65.7, 2398.0], [65.8, 2400.0], [65.9, 2403.0], [66.0, 2407.0], [66.1, 2409.0], [66.2, 2411.0], [66.3, 2413.0], [66.4, 2416.0], [66.5, 2420.0], [66.6, 2420.0], [66.7, 2421.0], [66.8, 2423.0], [66.9, 2428.0], [67.0, 2429.0], [67.1, 2438.0], [67.2, 2440.0], [67.3, 2441.0], [67.4, 2445.0], [67.5, 2445.0], [67.6, 2446.0], [67.7, 2450.0], [67.8, 2452.0], [67.9, 2452.0], [68.0, 2452.0], [68.1, 2457.0], [68.2, 2464.0], [68.3, 2471.0], [68.4, 2475.0], [68.5, 2479.0], [68.6, 2487.0], [68.7, 2489.0], [68.8, 2495.0], [68.9, 2497.0], [69.0, 2497.0], [69.1, 2499.0], [69.2, 2502.0], [69.3, 2502.0], [69.4, 2503.0], [69.5, 2504.0], [69.6, 2506.0], [69.7, 2512.0], [69.8, 2515.0], [69.9, 2516.0], [70.0, 2517.0], [70.1, 2518.0], [70.2, 2522.0], [70.3, 2529.0], [70.4, 2531.0], [70.5, 2536.0], [70.6, 2537.0], [70.7, 2540.0], [70.8, 2542.0], [70.9, 2545.0], [71.0, 2547.0], [71.1, 2550.0], [71.2, 2552.0], [71.3, 2552.0], [71.4, 2558.0], [71.5, 2576.0], [71.6, 2581.0], [71.7, 2585.0], [71.8, 2587.0], [71.9, 2590.0], [72.0, 2590.0], [72.1, 2591.0], [72.2, 2591.0], [72.3, 2592.0], [72.4, 2592.0], [72.5, 2592.0], [72.6, 2594.0], [72.7, 2597.0], [72.8, 2606.0], [72.9, 2608.0], [73.0, 2612.0], [73.1, 2613.0], [73.2, 2615.0], [73.3, 2617.0], [73.4, 2617.0], [73.5, 2630.0], [73.6, 2631.0], [73.7, 2632.0], [73.8, 2640.0], [73.9, 2643.0], [74.0, 2644.0], [74.1, 2648.0], [74.2, 2651.0], [74.3, 2656.0], [74.4, 2658.0], [74.5, 2664.0], [74.6, 2668.0], [74.7, 2669.0], [74.8, 2670.0], [74.9, 2671.0], [75.0, 2679.0], [75.1, 2681.0], [75.2, 2683.0], [75.3, 2683.0], [75.4, 2686.0], [75.5, 2687.0], [75.6, 2689.0], [75.7, 2696.0], [75.8, 2706.0], [75.9, 2716.0], [76.0, 2724.0], [76.1, 2726.0], [76.2, 2732.0], [76.3, 2743.0], [76.4, 2744.0], [76.5, 2747.0], [76.6, 2748.0], [76.7, 2749.0], [76.8, 2749.0], [76.9, 2759.0], [77.0, 2760.0], [77.1, 2761.0], [77.2, 2764.0], [77.3, 2765.0], [77.4, 2768.0], [77.5, 2768.0], [77.6, 2770.0], [77.7, 2774.0], [77.8, 2781.0], [77.9, 2783.0], [78.0, 2784.0], [78.1, 2790.0], [78.2, 2791.0], [78.3, 2792.0], [78.4, 2799.0], [78.5, 2803.0], [78.6, 2804.0], [78.7, 2806.0], [78.8, 2808.0], [78.9, 2813.0], [79.0, 2815.0], [79.1, 2818.0], [79.2, 2820.0], [79.3, 2821.0], [79.4, 2823.0], [79.5, 2833.0], [79.6, 2837.0], [79.7, 2838.0], [79.8, 2839.0], [79.9, 2841.0], [80.0, 2844.0], [80.1, 2845.0], [80.2, 2849.0], [80.3, 2854.0], [80.4, 2856.0], [80.5, 2859.0], [80.6, 2859.0], [80.7, 2861.0], [80.8, 2865.0], [80.9, 2869.0], [81.0, 2873.0], [81.1, 2873.0], [81.2, 2877.0], [81.3, 2878.0], [81.4, 2886.0], [81.5, 2887.0], [81.6, 2888.0], [81.7, 2890.0], [81.8, 2891.0], [81.9, 2898.0], [82.0, 2899.0], [82.1, 2902.0], [82.2, 2905.0], [82.3, 2908.0], [82.4, 2910.0], [82.5, 2911.0], [82.6, 2913.0], [82.7, 2916.0], [82.8, 2917.0], [82.9, 2918.0], [83.0, 2919.0], [83.1, 2933.0], [83.2, 2934.0], [83.3, 2936.0], [83.4, 2937.0], [83.5, 2941.0], [83.6, 2944.0], [83.7, 2946.0], [83.8, 2946.0], [83.9, 2948.0], [84.0, 2949.0], [84.1, 2950.0], [84.2, 2951.0], [84.3, 2953.0], [84.4, 2954.0], [84.5, 2963.0], [84.6, 2966.0], [84.7, 2967.0], [84.8, 2972.0], [84.9, 2978.0], [85.0, 2983.0], [85.1, 2985.0], [85.2, 2994.0], [85.3, 2996.0], [85.4, 3002.0], [85.5, 3009.0], [85.6, 3013.0], [85.7, 3014.0], [85.8, 3017.0], [85.9, 3021.0], [86.0, 3023.0], [86.1, 3025.0], [86.2, 3043.0], [86.3, 3053.0], [86.4, 3055.0], [86.5, 3058.0], [86.6, 3058.0], [86.7, 3063.0], [86.8, 3070.0], [86.9, 3073.0], [87.0, 3075.0], [87.1, 3075.0], [87.2, 3082.0], [87.3, 3084.0], [87.4, 3090.0], [87.5, 3090.0], [87.6, 3099.0], [87.7, 3103.0], [87.8, 3110.0], [87.9, 3113.0], [88.0, 3120.0], [88.1, 3131.0], [88.2, 3132.0], [88.3, 3155.0], [88.4, 3158.0], [88.5, 3159.0], [88.6, 3165.0], [88.7, 3167.0], [88.8, 3168.0], [88.9, 3176.0], [89.0, 3179.0], [89.1, 3180.0], [89.2, 3181.0], [89.3, 3188.0], [89.4, 3191.0], [89.5, 3200.0], [89.6, 3210.0], [89.7, 3219.0], [89.8, 3223.0], [89.9, 3227.0], [90.0, 3228.0], [90.1, 3234.0], [90.2, 3249.0], [90.3, 3254.0], [90.4, 3255.0], [90.5, 3255.0], [90.6, 3257.0], [90.7, 3259.0], [90.8, 3268.0], [90.9, 3271.0], [91.0, 3281.0], [91.1, 3288.0], [91.2, 3289.0], [91.3, 3307.0], [91.4, 3309.0], [91.5, 3335.0], [91.6, 3341.0], [91.7, 3341.0], [91.8, 3355.0], [91.9, 3358.0], [92.0, 3360.0], [92.1, 3364.0], [92.2, 3371.0], [92.3, 3373.0], [92.4, 3382.0], [92.5, 3391.0], [92.6, 3393.0], [92.7, 3396.0], [92.8, 3403.0], [92.9, 3413.0], [93.0, 3414.0], [93.1, 3419.0], [93.2, 3424.0], [93.3, 3425.0], [93.4, 3435.0], [93.5, 3436.0], [93.6, 3441.0], [93.7, 3441.0], [93.8, 3444.0], [93.9, 3445.0], [94.0, 3449.0], [94.1, 3455.0], [94.2, 3471.0], [94.3, 3475.0], [94.4, 3476.0], [94.5, 3476.0], [94.6, 3485.0], [94.7, 3488.0], [94.8, 3491.0], [94.9, 3501.0], [95.0, 3513.0], [95.1, 3514.0], [95.2, 3536.0], [95.3, 3551.0], [95.4, 3560.0], [95.5, 3577.0], [95.6, 3608.0], [95.7, 3608.0], [95.8, 3626.0], [95.9, 3677.0], [96.0, 3682.0], [96.1, 3687.0], [96.2, 3704.0], [96.3, 3713.0], [96.4, 3719.0], [96.5, 3749.0], [96.6, 3759.0], [96.7, 3792.0], [96.8, 3812.0], [96.9, 3831.0], [97.0, 3837.0], [97.1, 3838.0], [97.2, 3878.0], [97.3, 3920.0], [97.4, 3920.0], [97.5, 3943.0], [97.6, 3965.0], [97.7, 3995.0], [97.8, 4001.0], [97.9, 4061.0], [98.0, 4065.0], [98.1, 4084.0], [98.2, 4112.0], [98.3, 4119.0], [98.4, 4120.0], [98.5, 4125.0], [98.6, 4138.0], [98.7, 4149.0], [98.8, 4155.0], [98.9, 4185.0], [99.0, 4215.0], [99.1, 4231.0], [99.2, 4278.0], [99.3, 4286.0], [99.4, 4289.0], [99.5, 4293.0], [99.6, 4328.0], [99.7, 4338.0], [99.8, 4419.0], [99.9, 4529.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 101.0, "series": [{"data": [[600.0, 45.0], [700.0, 48.0], [800.0, 44.0], [900.0, 27.0], [1000.0, 31.0], [1100.0, 15.0], [1200.0, 7.0], [1300.0, 2.0], [1400.0, 1.0], [1500.0, 1.0], [100.0, 4.0], [1600.0, 4.0], [1700.0, 4.0], [1800.0, 21.0], [1900.0, 21.0], [2000.0, 32.0], [2100.0, 27.0], [2200.0, 28.0], [2300.0, 32.0], [2400.0, 34.0], [2500.0, 36.0], [2600.0, 30.0], [2800.0, 36.0], [2700.0, 28.0], [2900.0, 33.0], [3000.0, 23.0], [3100.0, 18.0], [200.0, 101.0], [3200.0, 18.0], [3300.0, 15.0], [3400.0, 21.0], [3500.0, 7.0], [3600.0, 6.0], [3700.0, 6.0], [3800.0, 5.0], [3900.0, 5.0], [4000.0, 4.0], [4100.0, 8.0], [4300.0, 2.0], [4200.0, 6.0], [4500.0, 1.0], [4400.0, 1.0], [300.0, 86.0], [400.0, 34.0], [500.0, 42.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 226.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 513.0, "series": [{"data": [[1.0, 261.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 226.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 513.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 144.74800000000005, "minX": 1.5496077E12, "maxY": 144.74800000000005, "series": [{"data": [[1.5496077E12, 144.74800000000005]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 276.1666666666667, "minX": 1.0, "maxY": 4419.0, "series": [{"data": [[2.0, 2017.0], [3.0, 2276.0], [4.0, 2887.0], [5.0, 2429.0], [6.0, 2841.0], [8.0, 2218.5], [9.0, 2377.0], [10.0, 2179.0], [11.0, 2104.0], [12.0, 2445.0], [14.0, 2286.5], [15.0, 2911.0], [17.0, 2637.5], [18.0, 2226.0], [19.0, 2304.0], [20.0, 2743.0], [21.0, 2400.0], [22.0, 2383.0], [23.0, 2178.0], [24.0, 711.75], [25.0, 395.0], [26.0, 427.3076923076923], [27.0, 578.4444444444445], [28.0, 678.4], [29.0, 484.8181818181818], [30.0, 366.24137931034477], [31.0, 276.1666666666667], [33.0, 635.25], [32.0, 641.4166666666666], [35.0, 488.25], [34.0, 1032.0], [37.0, 606.3333333333333], [36.0, 469.5454545454546], [39.0, 556.8571428571429], [38.0, 759.8], [41.0, 604.0], [40.0, 2341.0], [43.0, 761.8], [42.0, 928.3333333333334], [44.0, 864.0], [45.0, 1150.3333333333335], [47.0, 1199.0], [46.0, 2838.0], [48.0, 937.75], [49.0, 380.75], [50.0, 1399.25], [51.0, 880.2857142857143], [52.0, 759.8571428571429], [53.0, 1049.0], [54.0, 741.375], [55.0, 792.4], [56.0, 698.6999999999999], [57.0, 737.5714285714286], [58.0, 1446.0], [59.0, 2256.0], [61.0, 923.5], [60.0, 1262.0], [62.0, 1140.75], [63.0, 1134.3333333333335], [64.0, 796.4], [65.0, 808.1428571428571], [66.0, 1197.0], [67.0, 402.0], [68.0, 1748.3333333333333], [69.0, 1111.75], [71.0, 804.0], [70.0, 893.0], [72.0, 725.0], [75.0, 947.6], [74.0, 843.5], [73.0, 1028.6666666666665], [78.0, 1350.6666666666665], [77.0, 1630.0], [76.0, 1847.5], [79.0, 1058.0], [80.0, 1169.6666666666665], [83.0, 1327.3333333333335], [82.0, 606.0], [81.0, 3476.0], [84.0, 1338.6666666666665], [87.0, 994.2857142857142], [86.0, 986.5], [85.0, 979.4], [88.0, 1729.5], [90.0, 960.875], [89.0, 1289.5], [91.0, 1160.857142857143], [92.0, 762.0909090909091], [94.0, 1434.3333333333335], [93.0, 1540.2], [95.0, 968.0000000000001], [96.0, 1150.6], [97.0, 1533.5], [99.0, 3064.5], [101.0, 1604.0], [103.0, 1442.3333333333335], [102.0, 4185.0], [100.0, 2215.0], [106.0, 1212.6666666666667], [105.0, 1283.75], [104.0, 1116.0], [107.0, 1258.5], [109.0, 1161.75], [108.0, 1184.0], [110.0, 1137.3333333333333], [111.0, 899.2222222222222], [113.0, 1081.1818181818182], [112.0, 1268.923076923077], [114.0, 2112.3333333333335], [115.0, 3165.0], [118.0, 1218.5], [117.0, 1815.0], [119.0, 1818.5], [116.0, 3249.0], [121.0, 1391.75], [120.0, 1784.5], [123.0, 1468.4], [122.0, 1545.2], [126.0, 1415.75], [125.0, 1905.5], [124.0, 2592.5], [127.0, 1917.0], [128.0, 1298.0], [130.0, 1387.1666666666665], [129.0, 1267.7], [131.0, 1468.0], [132.0, 1479.2], [133.0, 1479.6], [134.0, 1688.0], [135.0, 2064.0], [143.0, 3396.0], [142.0, 2364.0], [141.0, 2376.0], [140.0, 2385.0], [139.0, 4112.0], [138.0, 3501.0], [137.0, 4149.0], [136.0, 2235.0], [151.0, 2420.0], [150.0, 2873.0], [149.0, 2394.0], [148.0, 2592.0], [147.0, 2764.0], [146.0, 2856.0], [145.0, 2804.0], [144.0, 3254.0], [159.0, 3471.0], [158.0, 2865.0], [157.0, 2910.0], [156.0, 4293.0], [155.0, 2134.0], [154.0, 4215.0], [153.0, 2373.0], [152.0, 2972.0], [167.0, 1843.0], [166.0, 4065.0], [165.0, 3307.0], [164.0, 2201.0], [163.0, 2499.0], [162.0, 3289.0], [161.0, 2630.0], [160.0, 1932.0], [175.0, 2759.0], [174.0, 2503.0], [173.0, 2108.0], [172.0, 2919.0], [171.0, 2656.0], [170.0, 3075.0], [169.0, 2615.0], [168.0, 3444.0], [183.0, 4138.0], [182.0, 2859.0], [181.0, 3053.0], [180.0, 2550.0], [179.0, 3943.0], [178.0, 2967.0], [177.0, 3218.0], [191.0, 2581.0], [190.0, 2383.0], [189.0, 4001.0], [188.0, 2540.0], [187.0, 3995.0], [186.0, 3677.0], [185.0, 3382.0], [184.0, 2632.0], [199.0, 3838.0], [198.0, 1635.0], [197.0, 2686.0], [196.0, 1784.0], [195.0, 2917.0], [194.0, 2258.0], [193.0, 2479.0], [192.0, 3491.0], [207.0, 3713.0], [206.0, 2963.0], [205.0, 4061.0], [204.0, 2768.0], [203.0, 3255.0], [202.0, 3082.0], [201.0, 3227.0], [200.0, 1963.0], [215.0, 3792.0], [214.0, 4419.0], [213.0, 2724.0], [212.0, 2784.0], [211.0, 3341.0], [210.0, 3393.0], [209.0, 3878.0], [208.0, 2946.0], [223.0, 2747.0], [222.0, 2301.0], [221.0, 3021.0], [220.0, 3812.0], [219.0, 3920.0], [218.0, 3025.0], [217.0, 2790.0], [216.0, 2489.0], [228.0, 2201.75], [229.0, 1813.3333333333333], [226.0, 2160.428571428571], [227.0, 2082.0], [225.0, 2755.0], [230.0, 2595.5], [231.0, 4231.0], [224.0, 4289.0], [234.0, 2436.0], [237.0, 2167.6666666666665], [239.0, 4338.0], [238.0, 2820.0], [236.0, 2243.0], [235.0, 2933.0], [232.0, 3084.0], [240.0, 2924.5], [242.0, 2139.3333333333335], [241.0, 2163.125], [244.0, 2542.5], [246.0, 2786.5], [247.0, 2606.0], [243.0, 2423.0], [252.0, 2521.0], [253.0, 2369.5], [255.0, 2248.2], [254.0, 3626.0], [251.0, 2529.0], [250.0, 3188.0], [249.0, 3425.0], [248.0, 2446.0], [268.0, 2667.3333333333335], [256.0, 2531.6666666666665], [257.0, 2437.5], [259.0, 2744.0], [258.0, 3435.0], [260.0, 2267.0], [264.0, 2220.0], [263.0, 2410.0], [262.0, 2626.5], [266.0, 2305.5], [265.0, 2574.0], [267.0, 2494.0], [269.0, 2314.2], [270.0, 2410.0], [271.0, 2837.0], [286.0, 2944.0], [281.0, 2295.25], [274.0, 2502.6666666666665], [273.0, 3455.0], [272.0, 3749.0], [275.0, 2833.0], [279.0, 2950.0], [278.0, 3176.0], [277.0, 2452.0], [276.0, 3759.0], [282.0, 2877.5], [287.0, 3831.0], [285.0, 2985.0], [284.0, 4125.0], [283.0, 3063.0], [280.0, 2126.0], [302.0, 2334.0], [289.0, 2744.5], [292.0, 2517.6666666666665], [291.0, 2633.5], [290.0, 3445.0], [301.0, 2761.0], [300.0, 2369.0], [293.0, 2708.5], [295.0, 2298.0], [288.0, 2464.0], [294.0, 3441.0], [296.0, 2387.0], [297.0, 2657.0], [299.0, 2793.0], [298.0, 2516.0], [303.0, 2905.0], [307.0, 3126.3333333333335], [304.0, 2636.0], [305.0, 3268.0], [311.0, 2813.0], [310.0, 2601.0], [309.0, 2536.75], [308.0, 2541.75], [319.0, 2309.3333333333335], [313.0, 3355.0], [312.0, 3920.0], [315.0, 2440.0], [314.0, 3364.0], [318.0, 2774.0], [317.0, 3577.0], [316.0, 2679.0], [333.0, 2701.5], [327.0, 2720.3333333333335], [323.0, 3134.0], [322.0, 3228.0], [321.0, 3373.0], [320.0, 3449.0], [332.0, 2983.0], [324.0, 2553.75], [326.0, 2874.5], [325.0, 3560.0], [328.0, 2799.0], [331.0, 2530.0], [330.0, 2610.6666666666665], [329.0, 3360.0], [335.0, 2640.0], [334.0, 2407.0], [348.0, 2635.5], [337.0, 2790.5], [336.0, 2614.0], [338.0, 3024.3333333333335], [339.0, 3158.0], [350.0, 2570.0], [351.0, 3475.0], [349.0, 2290.0], [341.0, 3093.3333333333335], [340.0, 3210.0], [342.0, 3099.0], [343.0, 3047.5], [344.0, 3004.5], [346.0, 2705.3333333333335], [347.0, 3112.0], [345.0, 2786.3333333333335], [352.0, 2943.0], [353.0, 2035.0], [355.0, 2948.0], [354.0, 3551.0], [356.0, 2339.3333333333335], [357.0, 2569.75], [358.0, 3116.0], [359.0, 3010.0], [365.0, 2838.333333333333], [364.0, 2724.6], [363.0, 2451.6666666666665], [367.0, 3259.0], [361.0, 2689.0], [360.0, 3017.0], [362.0, 2233.0], [366.0, 3007.0], [368.0, 2941.0], [1.0, 2818.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[144.74800000000005, 1681.6309999999996]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 368.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 6250.0, "minX": 1.5496077E12, "maxY": 6999.466666666666, "series": [{"data": [[1.5496077E12, 6999.466666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496077E12, 6250.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1681.6309999999996, "minX": 1.5496077E12, "maxY": 1681.6309999999996, "series": [{"data": [[1.5496077E12, 1681.6309999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1681.6190000000006, "minX": 1.5496077E12, "maxY": 1681.6190000000006, "series": [{"data": [[1.5496077E12, 1681.6190000000006]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 41.155000000000015, "minX": 1.5496077E12, "maxY": 41.155000000000015, "series": [{"data": [[1.5496077E12, 41.155000000000015]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 167.0, "minX": 1.5496077E12, "maxY": 4529.0, "series": [{"data": [[1.5496077E12, 4529.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496077E12, 167.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496077E12, 3227.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496077E12, 4214.700000000001]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496077E12, 3512.399999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 1829.0, "minX": 16.0, "maxY": 1829.0, "series": [{"data": [[16.0, 1829.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1829.0, "minX": 16.0, "maxY": 1829.0, "series": [{"data": [[16.0, 1829.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5496077E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5496077E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5496077E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5496077E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5496077E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5496077E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}

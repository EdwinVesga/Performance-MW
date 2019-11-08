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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 19955.0, "series": [{"data": [[0.0, 2.0], [0.1, 3.0], [0.2, 4.0], [0.3, 5.0], [0.4, 8.0], [0.5, 11.0], [0.6, 13.0], [0.7, 14.0], [0.8, 15.0], [0.9, 16.0], [1.0, 17.0], [1.1, 18.0], [1.2, 19.0], [1.3, 20.0], [1.4, 21.0], [1.5, 22.0], [1.6, 23.0], [1.7, 24.0], [1.8, 25.0], [1.9, 26.0], [2.0, 26.0], [2.1, 27.0], [2.2, 28.0], [2.3, 29.0], [2.4, 30.0], [2.5, 31.0], [2.6, 32.0], [2.7, 33.0], [2.8, 35.0], [2.9, 36.0], [3.0, 37.0], [3.1, 38.0], [3.2, 39.0], [3.3, 40.0], [3.4, 42.0], [3.5, 43.0], [3.6, 44.0], [3.7, 46.0], [3.8, 47.0], [3.9, 48.0], [4.0, 50.0], [4.1, 51.0], [4.2, 52.0], [4.3, 54.0], [4.4, 55.0], [4.5, 57.0], [4.6, 58.0], [4.7, 60.0], [4.8, 61.0], [4.9, 63.0], [5.0, 64.0], [5.1, 65.0], [5.2, 67.0], [5.3, 68.0], [5.4, 70.0], [5.5, 71.0], [5.6, 73.0], [5.7, 74.0], [5.8, 76.0], [5.9, 77.0], [6.0, 78.0], [6.1, 80.0], [6.2, 82.0], [6.3, 83.0], [6.4, 85.0], [6.5, 87.0], [6.6, 88.0], [6.7, 90.0], [6.8, 91.0], [6.9, 93.0], [7.0, 95.0], [7.1, 97.0], [7.2, 98.0], [7.3, 100.0], [7.4, 102.0], [7.5, 104.0], [7.6, 106.0], [7.7, 108.0], [7.8, 110.0], [7.9, 111.0], [8.0, 113.0], [8.1, 115.0], [8.2, 117.0], [8.3, 119.0], [8.4, 121.0], [8.5, 123.0], [8.6, 125.0], [8.7, 128.0], [8.8, 130.0], [8.9, 132.0], [9.0, 134.0], [9.1, 136.0], [9.2, 138.0], [9.3, 141.0], [9.4, 143.0], [9.5, 145.0], [9.6, 147.0], [9.7, 149.0], [9.8, 152.0], [9.9, 154.0], [10.0, 156.0], [10.1, 158.0], [10.2, 160.0], [10.3, 162.0], [10.4, 165.0], [10.5, 167.0], [10.6, 170.0], [10.7, 172.0], [10.8, 175.0], [10.9, 177.0], [11.0, 180.0], [11.1, 182.0], [11.2, 184.0], [11.3, 187.0], [11.4, 190.0], [11.5, 193.0], [11.6, 195.0], [11.7, 198.0], [11.8, 200.0], [11.9, 203.0], [12.0, 206.0], [12.1, 209.0], [12.2, 211.0], [12.3, 214.0], [12.4, 217.0], [12.5, 220.0], [12.6, 222.0], [12.7, 225.0], [12.8, 228.0], [12.9, 231.0], [13.0, 234.0], [13.1, 237.0], [13.2, 240.0], [13.3, 243.0], [13.4, 246.0], [13.5, 249.0], [13.6, 252.0], [13.7, 255.0], [13.8, 258.0], [13.9, 261.0], [14.0, 264.0], [14.1, 267.0], [14.2, 270.0], [14.3, 273.0], [14.4, 276.0], [14.5, 279.0], [14.6, 282.0], [14.7, 285.0], [14.8, 288.0], [14.9, 291.0], [15.0, 294.0], [15.1, 296.0], [15.2, 299.0], [15.3, 302.0], [15.4, 305.0], [15.5, 308.0], [15.6, 311.0], [15.7, 314.0], [15.8, 317.0], [15.9, 320.0], [16.0, 323.0], [16.1, 327.0], [16.2, 330.0], [16.3, 333.0], [16.4, 336.0], [16.5, 340.0], [16.6, 343.0], [16.7, 346.0], [16.8, 349.0], [16.9, 352.0], [17.0, 356.0], [17.1, 359.0], [17.2, 363.0], [17.3, 366.0], [17.4, 370.0], [17.5, 373.0], [17.6, 376.0], [17.7, 380.0], [17.8, 383.0], [17.9, 387.0], [18.0, 390.0], [18.1, 393.0], [18.2, 396.0], [18.3, 400.0], [18.4, 403.0], [18.5, 407.0], [18.6, 410.0], [18.7, 414.0], [18.8, 417.0], [18.9, 420.0], [19.0, 423.0], [19.1, 427.0], [19.2, 430.0], [19.3, 433.0], [19.4, 436.0], [19.5, 439.0], [19.6, 443.0], [19.7, 446.0], [19.8, 449.0], [19.9, 452.0], [20.0, 456.0], [20.1, 459.0], [20.2, 462.0], [20.3, 465.0], [20.4, 469.0], [20.5, 472.0], [20.6, 475.0], [20.7, 478.0], [20.8, 481.0], [20.9, 484.0], [21.0, 487.0], [21.1, 490.0], [21.2, 493.0], [21.3, 495.0], [21.4, 498.0], [21.5, 500.0], [21.6, 503.0], [21.7, 506.0], [21.8, 508.0], [21.9, 511.0], [22.0, 514.0], [22.1, 516.0], [22.2, 518.0], [22.3, 521.0], [22.4, 523.0], [22.5, 525.0], [22.6, 528.0], [22.7, 530.0], [22.8, 532.0], [22.9, 534.0], [23.0, 536.0], [23.1, 538.0], [23.2, 540.0], [23.3, 542.0], [23.4, 544.0], [23.5, 546.0], [23.6, 548.0], [23.7, 550.0], [23.8, 552.0], [23.9, 554.0], [24.0, 556.0], [24.1, 558.0], [24.2, 560.0], [24.3, 562.0], [24.4, 564.0], [24.5, 565.0], [24.6, 567.0], [24.7, 569.0], [24.8, 571.0], [24.9, 573.0], [25.0, 576.0], [25.1, 577.0], [25.2, 579.0], [25.3, 581.0], [25.4, 583.0], [25.5, 585.0], [25.6, 587.0], [25.7, 589.0], [25.8, 590.0], [25.9, 592.0], [26.0, 594.0], [26.1, 596.0], [26.2, 597.0], [26.3, 599.0], [26.4, 601.0], [26.5, 603.0], [26.6, 605.0], [26.7, 607.0], [26.8, 609.0], [26.9, 610.0], [27.0, 612.0], [27.1, 614.0], [27.2, 616.0], [27.3, 617.0], [27.4, 619.0], [27.5, 621.0], [27.6, 623.0], [27.7, 624.0], [27.8, 626.0], [27.9, 628.0], [28.0, 630.0], [28.1, 631.0], [28.2, 633.0], [28.3, 634.0], [28.4, 636.0], [28.5, 638.0], [28.6, 639.0], [28.7, 641.0], [28.8, 643.0], [28.9, 645.0], [29.0, 646.0], [29.1, 648.0], [29.2, 650.0], [29.3, 651.0], [29.4, 653.0], [29.5, 655.0], [29.6, 657.0], [29.7, 659.0], [29.8, 660.0], [29.9, 662.0], [30.0, 664.0], [30.1, 666.0], [30.2, 668.0], [30.3, 669.0], [30.4, 671.0], [30.5, 673.0], [30.6, 675.0], [30.7, 677.0], [30.8, 679.0], [30.9, 680.0], [31.0, 682.0], [31.1, 684.0], [31.2, 685.0], [31.3, 687.0], [31.4, 689.0], [31.5, 690.0], [31.6, 692.0], [31.7, 694.0], [31.8, 696.0], [31.9, 697.0], [32.0, 699.0], [32.1, 701.0], [32.2, 703.0], [32.3, 704.0], [32.4, 706.0], [32.5, 708.0], [32.6, 710.0], [32.7, 711.0], [32.8, 713.0], [32.9, 715.0], [33.0, 716.0], [33.1, 718.0], [33.2, 719.0], [33.3, 721.0], [33.4, 723.0], [33.5, 724.0], [33.6, 726.0], [33.7, 728.0], [33.8, 729.0], [33.9, 731.0], [34.0, 733.0], [34.1, 735.0], [34.2, 736.0], [34.3, 738.0], [34.4, 739.0], [34.5, 741.0], [34.6, 743.0], [34.7, 744.0], [34.8, 746.0], [34.9, 748.0], [35.0, 750.0], [35.1, 751.0], [35.2, 753.0], [35.3, 754.0], [35.4, 756.0], [35.5, 757.0], [35.6, 759.0], [35.7, 761.0], [35.8, 763.0], [35.9, 764.0], [36.0, 766.0], [36.1, 768.0], [36.2, 769.0], [36.3, 771.0], [36.4, 772.0], [36.5, 774.0], [36.6, 776.0], [36.7, 777.0], [36.8, 779.0], [36.9, 781.0], [37.0, 782.0], [37.1, 784.0], [37.2, 785.0], [37.3, 787.0], [37.4, 789.0], [37.5, 791.0], [37.6, 793.0], [37.7, 794.0], [37.8, 796.0], [37.9, 797.0], [38.0, 799.0], [38.1, 801.0], [38.2, 803.0], [38.3, 804.0], [38.4, 806.0], [38.5, 808.0], [38.6, 809.0], [38.7, 811.0], [38.8, 813.0], [38.9, 815.0], [39.0, 816.0], [39.1, 818.0], [39.2, 819.0], [39.3, 821.0], [39.4, 823.0], [39.5, 825.0], [39.6, 826.0], [39.7, 828.0], [39.8, 830.0], [39.9, 832.0], [40.0, 833.0], [40.1, 835.0], [40.2, 837.0], [40.3, 839.0], [40.4, 840.0], [40.5, 842.0], [40.6, 844.0], [40.7, 846.0], [40.8, 848.0], [40.9, 850.0], [41.0, 851.0], [41.1, 853.0], [41.2, 855.0], [41.3, 857.0], [41.4, 858.0], [41.5, 860.0], [41.6, 862.0], [41.7, 863.0], [41.8, 865.0], [41.9, 867.0], [42.0, 869.0], [42.1, 871.0], [42.2, 872.0], [42.3, 874.0], [42.4, 876.0], [42.5, 878.0], [42.6, 880.0], [42.7, 882.0], [42.8, 884.0], [42.9, 885.0], [43.0, 887.0], [43.1, 889.0], [43.2, 891.0], [43.3, 893.0], [43.4, 894.0], [43.5, 896.0], [43.6, 898.0], [43.7, 900.0], [43.8, 902.0], [43.9, 904.0], [44.0, 906.0], [44.1, 908.0], [44.2, 909.0], [44.3, 911.0], [44.4, 913.0], [44.5, 915.0], [44.6, 917.0], [44.7, 919.0], [44.8, 921.0], [44.9, 923.0], [45.0, 924.0], [45.1, 926.0], [45.2, 928.0], [45.3, 930.0], [45.4, 932.0], [45.5, 934.0], [45.6, 936.0], [45.7, 938.0], [45.8, 940.0], [45.9, 942.0], [46.0, 944.0], [46.1, 946.0], [46.2, 948.0], [46.3, 949.0], [46.4, 952.0], [46.5, 954.0], [46.6, 955.0], [46.7, 957.0], [46.8, 959.0], [46.9, 961.0], [47.0, 963.0], [47.1, 965.0], [47.2, 967.0], [47.3, 968.0], [47.4, 970.0], [47.5, 972.0], [47.6, 974.0], [47.7, 975.0], [47.8, 977.0], [47.9, 979.0], [48.0, 981.0], [48.1, 983.0], [48.2, 985.0], [48.3, 987.0], [48.4, 989.0], [48.5, 991.0], [48.6, 993.0], [48.7, 995.0], [48.8, 997.0], [48.9, 999.0], [49.0, 1000.0], [49.1, 1002.0], [49.2, 1004.0], [49.3, 1006.0], [49.4, 1008.0], [49.5, 1010.0], [49.6, 1012.0], [49.7, 1014.0], [49.8, 1016.0], [49.9, 1018.0], [50.0, 1020.0], [50.1, 1022.0], [50.2, 1024.0], [50.3, 1026.0], [50.4, 1028.0], [50.5, 1030.0], [50.6, 1032.0], [50.7, 1034.0], [50.8, 1036.0], [50.9, 1038.0], [51.0, 1040.0], [51.1, 1042.0], [51.2, 1045.0], [51.3, 1047.0], [51.4, 1049.0], [51.5, 1051.0], [51.6, 1053.0], [51.7, 1055.0], [51.8, 1057.0], [51.9, 1059.0], [52.0, 1060.0], [52.1, 1063.0], [52.2, 1064.0], [52.3, 1067.0], [52.4, 1068.0], [52.5, 1070.0], [52.6, 1072.0], [52.7, 1074.0], [52.8, 1076.0], [52.9, 1078.0], [53.0, 1080.0], [53.1, 1082.0], [53.2, 1084.0], [53.3, 1086.0], [53.4, 1088.0], [53.5, 1090.0], [53.6, 1092.0], [53.7, 1094.0], [53.8, 1096.0], [53.9, 1098.0], [54.0, 1100.0], [54.1, 1102.0], [54.2, 1104.0], [54.3, 1106.0], [54.4, 1108.0], [54.5, 1111.0], [54.6, 1113.0], [54.7, 1115.0], [54.8, 1117.0], [54.9, 1119.0], [55.0, 1121.0], [55.1, 1123.0], [55.2, 1126.0], [55.3, 1128.0], [55.4, 1130.0], [55.5, 1132.0], [55.6, 1134.0], [55.7, 1136.0], [55.8, 1139.0], [55.9, 1140.0], [56.0, 1143.0], [56.1, 1145.0], [56.2, 1147.0], [56.3, 1149.0], [56.4, 1151.0], [56.5, 1154.0], [56.6, 1156.0], [56.7, 1158.0], [56.8, 1160.0], [56.9, 1163.0], [57.0, 1165.0], [57.1, 1167.0], [57.2, 1169.0], [57.3, 1172.0], [57.4, 1174.0], [57.5, 1176.0], [57.6, 1178.0], [57.7, 1181.0], [57.8, 1183.0], [57.9, 1185.0], [58.0, 1187.0], [58.1, 1189.0], [58.2, 1192.0], [58.3, 1194.0], [58.4, 1196.0], [58.5, 1198.0], [58.6, 1201.0], [58.7, 1203.0], [58.8, 1205.0], [58.9, 1208.0], [59.0, 1210.0], [59.1, 1212.0], [59.2, 1215.0], [59.3, 1217.0], [59.4, 1219.0], [59.5, 1221.0], [59.6, 1223.0], [59.7, 1225.0], [59.8, 1228.0], [59.9, 1230.0], [60.0, 1232.0], [60.1, 1234.0], [60.2, 1237.0], [60.3, 1239.0], [60.4, 1241.0], [60.5, 1243.0], [60.6, 1245.0], [60.7, 1248.0], [60.8, 1250.0], [60.9, 1253.0], [61.0, 1255.0], [61.1, 1257.0], [61.2, 1259.0], [61.3, 1262.0], [61.4, 1264.0], [61.5, 1267.0], [61.6, 1269.0], [61.7, 1271.0], [61.8, 1273.0], [61.9, 1276.0], [62.0, 1278.0], [62.1, 1281.0], [62.2, 1283.0], [62.3, 1286.0], [62.4, 1289.0], [62.5, 1291.0], [62.6, 1294.0], [62.7, 1296.0], [62.8, 1299.0], [62.9, 1301.0], [63.0, 1304.0], [63.1, 1306.0], [63.2, 1309.0], [63.3, 1312.0], [63.4, 1314.0], [63.5, 1317.0], [63.6, 1319.0], [63.7, 1322.0], [63.8, 1324.0], [63.9, 1327.0], [64.0, 1330.0], [64.1, 1333.0], [64.2, 1335.0], [64.3, 1338.0], [64.4, 1341.0], [64.5, 1343.0], [64.6, 1346.0], [64.7, 1349.0], [64.8, 1351.0], [64.9, 1353.0], [65.0, 1356.0], [65.1, 1358.0], [65.2, 1361.0], [65.3, 1363.0], [65.4, 1366.0], [65.5, 1369.0], [65.6, 1371.0], [65.7, 1374.0], [65.8, 1377.0], [65.9, 1379.0], [66.0, 1382.0], [66.1, 1385.0], [66.2, 1388.0], [66.3, 1390.0], [66.4, 1392.0], [66.5, 1395.0], [66.6, 1398.0], [66.7, 1400.0], [66.8, 1403.0], [66.9, 1407.0], [67.0, 1409.0], [67.1, 1412.0], [67.2, 1415.0], [67.3, 1418.0], [67.4, 1420.0], [67.5, 1423.0], [67.6, 1426.0], [67.7, 1429.0], [67.8, 1432.0], [67.9, 1435.0], [68.0, 1438.0], [68.1, 1441.0], [68.2, 1443.0], [68.3, 1446.0], [68.4, 1449.0], [68.5, 1452.0], [68.6, 1455.0], [68.7, 1458.0], [68.8, 1461.0], [68.9, 1464.0], [69.0, 1467.0], [69.1, 1470.0], [69.2, 1472.0], [69.3, 1475.0], [69.4, 1479.0], [69.5, 1481.0], [69.6, 1484.0], [69.7, 1487.0], [69.8, 1490.0], [69.9, 1493.0], [70.0, 1496.0], [70.1, 1499.0], [70.2, 1502.0], [70.3, 1505.0], [70.4, 1508.0], [70.5, 1511.0], [70.6, 1514.0], [70.7, 1517.0], [70.8, 1520.0], [70.9, 1523.0], [71.0, 1526.0], [71.1, 1529.0], [71.2, 1532.0], [71.3, 1535.0], [71.4, 1538.0], [71.5, 1541.0], [71.6, 1544.0], [71.7, 1547.0], [71.8, 1550.0], [71.9, 1553.0], [72.0, 1556.0], [72.1, 1560.0], [72.2, 1563.0], [72.3, 1566.0], [72.4, 1569.0], [72.5, 1572.0], [72.6, 1575.0], [72.7, 1578.0], [72.8, 1581.0], [72.9, 1584.0], [73.0, 1587.0], [73.1, 1591.0], [73.2, 1594.0], [73.3, 1597.0], [73.4, 1601.0], [73.5, 1604.0], [73.6, 1608.0], [73.7, 1611.0], [73.8, 1614.0], [73.9, 1617.0], [74.0, 1620.0], [74.1, 1624.0], [74.2, 1626.0], [74.3, 1630.0], [74.4, 1633.0], [74.5, 1636.0], [74.6, 1640.0], [74.7, 1643.0], [74.8, 1646.0], [74.9, 1650.0], [75.0, 1653.0], [75.1, 1657.0], [75.2, 1660.0], [75.3, 1663.0], [75.4, 1667.0], [75.5, 1670.0], [75.6, 1674.0], [75.7, 1678.0], [75.8, 1680.0], [75.9, 1684.0], [76.0, 1687.0], [76.1, 1691.0], [76.2, 1694.0], [76.3, 1698.0], [76.4, 1702.0], [76.5, 1705.0], [76.6, 1709.0], [76.7, 1712.0], [76.8, 1716.0], [76.9, 1720.0], [77.0, 1723.0], [77.1, 1727.0], [77.2, 1731.0], [77.3, 1735.0], [77.4, 1739.0], [77.5, 1742.0], [77.6, 1745.0], [77.7, 1749.0], [77.8, 1753.0], [77.9, 1757.0], [78.0, 1761.0], [78.1, 1765.0], [78.2, 1768.0], [78.3, 1773.0], [78.4, 1777.0], [78.5, 1781.0], [78.6, 1785.0], [78.7, 1789.0], [78.8, 1792.0], [78.9, 1796.0], [79.0, 1800.0], [79.1, 1803.0], [79.2, 1808.0], [79.3, 1812.0], [79.4, 1817.0], [79.5, 1821.0], [79.6, 1825.0], [79.7, 1829.0], [79.8, 1833.0], [79.9, 1837.0], [80.0, 1841.0], [80.1, 1846.0], [80.2, 1850.0], [80.3, 1854.0], [80.4, 1858.0], [80.5, 1861.0], [80.6, 1866.0], [80.7, 1870.0], [80.8, 1875.0], [80.9, 1879.0], [81.0, 1884.0], [81.1, 1888.0], [81.2, 1892.0], [81.3, 1895.0], [81.4, 1900.0], [81.5, 1905.0], [81.6, 1909.0], [81.7, 1915.0], [81.8, 1919.0], [81.9, 1923.0], [82.0, 1927.0], [82.1, 1932.0], [82.2, 1936.0], [82.3, 1941.0], [82.4, 1946.0], [82.5, 1952.0], [82.6, 1957.0], [82.7, 1962.0], [82.8, 1967.0], [82.9, 1972.0], [83.0, 1978.0], [83.1, 1983.0], [83.2, 1988.0], [83.3, 1993.0], [83.4, 1998.0], [83.5, 2003.0], [83.6, 2007.0], [83.7, 2012.0], [83.8, 2017.0], [83.9, 2022.0], [84.0, 2027.0], [84.1, 2032.0], [84.2, 2037.0], [84.3, 2042.0], [84.4, 2047.0], [84.5, 2053.0], [84.6, 2058.0], [84.7, 2062.0], [84.8, 2068.0], [84.9, 2073.0], [85.0, 2078.0], [85.1, 2084.0], [85.2, 2089.0], [85.3, 2095.0], [85.4, 2100.0], [85.5, 2107.0], [85.6, 2113.0], [85.7, 2118.0], [85.8, 2124.0], [85.9, 2129.0], [86.0, 2134.0], [86.1, 2139.0], [86.2, 2145.0], [86.3, 2151.0], [86.4, 2157.0], [86.5, 2163.0], [86.6, 2169.0], [86.7, 2175.0], [86.8, 2180.0], [86.9, 2185.0], [87.0, 2191.0], [87.1, 2197.0], [87.2, 2202.0], [87.3, 2208.0], [87.4, 2213.0], [87.5, 2219.0], [87.6, 2225.0], [87.7, 2231.0], [87.8, 2236.0], [87.9, 2241.0], [88.0, 2247.0], [88.1, 2253.0], [88.2, 2259.0], [88.3, 2264.0], [88.4, 2270.0], [88.5, 2275.0], [88.6, 2281.0], [88.7, 2287.0], [88.8, 2292.0], [88.9, 2299.0], [89.0, 2305.0], [89.1, 2311.0], [89.2, 2317.0], [89.3, 2323.0], [89.4, 2328.0], [89.5, 2334.0], [89.6, 2340.0], [89.7, 2346.0], [89.8, 2352.0], [89.9, 2359.0], [90.0, 2364.0], [90.1, 2370.0], [90.2, 2377.0], [90.3, 2384.0], [90.4, 2390.0], [90.5, 2397.0], [90.6, 2404.0], [90.7, 2411.0], [90.8, 2418.0], [90.9, 2425.0], [91.0, 2432.0], [91.1, 2439.0], [91.2, 2445.0], [91.3, 2453.0], [91.4, 2461.0], [91.5, 2468.0], [91.6, 2477.0], [91.7, 2485.0], [91.8, 2493.0], [91.9, 2501.0], [92.0, 2509.0], [92.1, 2519.0], [92.2, 2528.0], [92.3, 2536.0], [92.4, 2545.0], [92.5, 2554.0], [92.6, 2563.0], [92.7, 2573.0], [92.8, 2583.0], [92.9, 2593.0], [93.0, 2603.0], [93.1, 2612.0], [93.2, 2623.0], [93.3, 2632.0], [93.4, 2642.0], [93.5, 2653.0], [93.6, 2665.0], [93.7, 2676.0], [93.8, 2687.0], [93.9, 2700.0], [94.0, 2712.0], [94.1, 2724.0], [94.2, 2735.0], [94.3, 2748.0], [94.4, 2760.0], [94.5, 2771.0], [94.6, 2782.0], [94.7, 2793.0], [94.8, 2805.0], [94.9, 2816.0], [95.0, 2827.0], [95.1, 2839.0], [95.2, 2853.0], [95.3, 2866.0], [95.4, 2880.0], [95.5, 2895.0], [95.6, 2909.0], [95.7, 2923.0], [95.8, 2936.0], [95.9, 2950.0], [96.0, 2966.0], [96.1, 2981.0], [96.2, 2998.0], [96.3, 3014.0], [96.4, 3029.0], [96.5, 3048.0], [96.6, 3068.0], [96.7, 3086.0], [96.8, 3107.0], [96.9, 3128.0], [97.0, 3148.0], [97.1, 3170.0], [97.2, 3195.0], [97.3, 3216.0], [97.4, 3241.0], [97.5, 3265.0], [97.6, 3290.0], [97.7, 3313.0], [97.8, 3339.0], [97.9, 3366.0], [98.0, 3397.0], [98.1, 3428.0], [98.2, 3462.0], [98.3, 3493.0], [98.4, 3525.0], [98.5, 3564.0], [98.6, 3606.0], [98.7, 3648.0], [98.8, 3695.0], [98.9, 3764.0], [99.0, 3823.0], [99.1, 3894.0], [99.2, 3967.0], [99.3, 4064.0], [99.4, 4197.0], [99.5, 4360.0], [99.6, 4587.0], [99.7, 5095.0], [99.8, 6376.0], [99.9, 11909.0], [100.0, 19955.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 12925.0, "series": [{"data": [[0.0, 12925.0], [100.0, 8025.0], [200.0, 6117.0], [300.0, 5490.0], [400.0, 5646.0], [500.0, 8644.0], [600.0, 10175.0], [700.0, 10681.0], [800.0, 10046.0], [900.0, 9367.0], [1000.0, 8929.0], [1100.0, 8184.0], [1200.0, 7579.0], [1300.0, 6850.0], [1400.0, 6176.0], [1500.0, 5761.0], [1600.0, 5306.0], [1700.0, 4708.0], [1800.0, 4276.0], [1900.0, 3639.0], [2000.0, 3458.0], [2100.0, 3157.0], [2200.0, 3131.0], [2300.0, 2887.0], [2400.0, 2400.0], [2500.0, 1932.0], [2600.0, 1657.0], [2700.0, 1512.0], [2800.0, 1409.0], [2900.0, 1192.0], [3000.0, 987.0], [3100.0, 824.0], [3200.0, 736.0], [3300.0, 656.0], [3400.0, 549.0], [3500.0, 485.0], [3700.0, 281.0], [3600.0, 379.0], [3800.0, 262.0], [3900.0, 230.0], [4000.0, 164.0], [4100.0, 130.0], [4300.0, 103.0], [4200.0, 113.0], [4500.0, 73.0], [4600.0, 49.0], [4400.0, 74.0], [4700.0, 52.0], [4800.0, 25.0], [5100.0, 30.0], [5000.0, 25.0], [4900.0, 18.0], [5300.0, 18.0], [5200.0, 13.0], [5500.0, 13.0], [5600.0, 24.0], [5400.0, 16.0], [5800.0, 11.0], [5700.0, 12.0], [6000.0, 12.0], [6100.0, 6.0], [5900.0, 9.0], [6300.0, 10.0], [6200.0, 7.0], [6400.0, 7.0], [6500.0, 8.0], [6600.0, 12.0], [6900.0, 15.0], [6700.0, 6.0], [6800.0, 2.0], [7100.0, 3.0], [7000.0, 9.0], [7400.0, 1.0], [7300.0, 3.0], [7200.0, 6.0], [7500.0, 6.0], [7600.0, 3.0], [7800.0, 1.0], [7700.0, 1.0], [7900.0, 3.0], [8000.0, 2.0], [8100.0, 4.0], [8200.0, 2.0], [8300.0, 4.0], [8500.0, 5.0], [8700.0, 2.0], [8600.0, 2.0], [8400.0, 1.0], [9100.0, 1.0], [8800.0, 5.0], [9200.0, 3.0], [8900.0, 1.0], [9000.0, 1.0], [9700.0, 6.0], [9300.0, 2.0], [9400.0, 3.0], [9500.0, 3.0], [9600.0, 1.0], [10200.0, 3.0], [10100.0, 3.0], [9900.0, 3.0], [9800.0, 1.0], [10600.0, 3.0], [10300.0, 4.0], [10700.0, 2.0], [10400.0, 1.0], [10800.0, 2.0], [10900.0, 1.0], [11100.0, 2.0], [11300.0, 2.0], [11600.0, 3.0], [11400.0, 4.0], [11700.0, 2.0], [11500.0, 1.0], [11900.0, 5.0], [12100.0, 2.0], [12000.0, 6.0], [12200.0, 3.0], [11800.0, 1.0], [12300.0, 3.0], [12700.0, 3.0], [12400.0, 4.0], [12500.0, 3.0], [12600.0, 7.0], [12800.0, 5.0], [13000.0, 4.0], [12900.0, 6.0], [13300.0, 8.0], [13200.0, 4.0], [13100.0, 3.0], [13600.0, 4.0], [13800.0, 2.0], [13400.0, 3.0], [13500.0, 2.0], [13700.0, 2.0], [14300.0, 6.0], [14000.0, 1.0], [13900.0, 2.0], [14100.0, 1.0], [14400.0, 2.0], [14800.0, 2.0], [14600.0, 1.0], [14700.0, 1.0], [15000.0, 6.0], [15200.0, 2.0], [15300.0, 2.0], [15500.0, 4.0], [15600.0, 1.0], [15400.0, 5.0], [15700.0, 2.0], [15800.0, 2.0], [15900.0, 3.0], [16000.0, 4.0], [16300.0, 4.0], [16100.0, 1.0], [16700.0, 1.0], [16400.0, 3.0], [16600.0, 1.0], [17200.0, 1.0], [17700.0, 1.0], [18200.0, 4.0], [18000.0, 2.0], [18300.0, 2.0], [18400.0, 2.0], [18600.0, 7.0], [19400.0, 2.0], [18700.0, 9.0], [18500.0, 2.0], [18800.0, 3.0], [19100.0, 2.0], [19000.0, 1.0], [19200.0, 1.0], [19300.0, 1.0], [18900.0, 3.0], [19900.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 19900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 2971.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 86232.0, "series": [{"data": [[1.0, 86232.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 2971.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 35703.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 53101.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 411.62845314264246, "minX": 1.549803E12, "maxY": 1321.340549620618, "series": [{"data": [[1.54980336E12, 1321.340549620618], [1.54980306E12, 1265.086385335115], [1.54980342E12, 904.9913542463602], [1.54980312E12, 1069.761127264585], [1.5498033E12, 603.2375443725223], [1.549803E12, 411.62845314264246]], "isOverall": false, "label": "jp@gc - Ultimate Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54980342E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 3.8888888888888884, "minX": 1.0, "maxY": 2679.5000000000005, "series": [{"data": [[2.0, 4.611111111111111], [3.0, 5.285714285714286], [4.0, 5.68], [5.0, 6.71875], [6.0, 7.6764705882352935], [7.0, 9.041666666666668], [8.0, 10.419354838709676], [9.0, 11.74074074074074], [10.0, 11.700000000000001], [11.0, 13.0], [12.0, 13.678571428571427], [13.0, 14.5], [14.0, 16.60526315789474], [15.0, 17.2258064516129], [16.0, 17.58536585365854], [17.0, 21.5], [18.0, 22.38709677419355], [19.0, 20.38636363636364], [20.0, 21.897435897435894], [21.0, 25.794117647058822], [22.0, 23.28571428571429], [23.0, 30.37037037037037], [24.0, 24.92105263157895], [25.0, 29.97916666666667], [26.0, 27.6875], [27.0, 31.947368421052637], [28.0, 28.6], [29.0, 33.70588235294117], [30.0, 32.22448979591837], [31.0, 37.46666666666666], [33.0, 42.03703703703704], [32.0, 51.26086956521739], [35.0, 39.628571428571426], [34.0, 44.34146341463414], [37.0, 62.70270270270267], [36.0, 35.32432432432432], [38.0, 258.4920634920635], [39.0, 51.93333333333333], [40.0, 57.813953488372086], [41.0, 82.73333333333333], [42.0, 64.4909090909091], [43.0, 72.23076923076923], [44.0, 65.44444444444446], [45.0, 63.35555555555557], [46.0, 53.199999999999996], [47.0, 97.22857142857141], [48.0, 79.57777777777775], [49.0, 81.96774193548386], [50.0, 83.19444444444444], [51.0, 60.42307692307692], [52.0, 61.199999999999996], [53.0, 52.13888888888889], [54.0, 58.28571428571429], [55.0, 57.69999999999999], [56.0, 70.95348837209302], [57.0, 86.37037037037037], [58.0, 91.26829268292683], [59.0, 78.3214285714286], [60.0, 83.02631578947367], [61.0, 90.7], [62.0, 80.19354838709678], [63.0, 64.94117647058825], [64.0, 87.03703703703704], [65.0, 74.99999999999999], [66.0, 71.32142857142857], [67.0, 73.03174603174602], [68.0, 102.11428571428569], [69.0, 108.01639344262297], [70.0, 75.3148148148148], [71.0, 78.7962962962963], [73.0, 67.67213114754095], [74.0, 104.13698630136986], [75.0, 81.14814814814815], [72.0, 66.94936708860759], [76.0, 64.75757575757575], [77.0, 90.84090909090911], [78.0, 117.01612903225808], [79.0, 84.06756756756758], [80.0, 101.60606060606062], [81.0, 113.04545454545456], [82.0, 132.84782608695653], [83.0, 98.72499999999998], [84.0, 100.37837837837841], [85.0, 93.06250000000003], [86.0, 100.59999999999998], [87.0, 88.3030303030303], [88.0, 120.67346938775509], [89.0, 121.95833333333336], [90.0, 112.6176470588235], [91.0, 110.15], [92.0, 109.15151515151516], [93.0, 94.58333333333334], [94.0, 135.73684210526315], [95.0, 122.7111111111111], [96.0, 114.24324324324326], [97.0, 117.51515151515153], [98.0, 86.68749999999999], [99.0, 104.28888888888889], [100.0, 96.19090909090907], [101.0, 108.4], [102.0, 104.15384615384617], [103.0, 126.08571428571425], [104.0, 123.77777777777777], [105.0, 127.10869565217392], [106.0, 133.2820512820513], [107.0, 133.53488372093025], [108.0, 125.2631578947368], [109.0, 274.8260869565217], [111.0, 174.79166666666663], [110.0, 216.11111111111111], [112.0, 145.74999999999997], [113.0, 130.0281690140845], [114.0, 141.44230769230774], [115.0, 136.32352941176467], [116.0, 128.5238095238095], [117.0, 189.08108108108104], [118.0, 174.15384615384616], [119.0, 195.83333333333337], [120.0, 159.6181818181818], [121.0, 155.87179487179495], [122.0, 130.8928571428571], [123.0, 139.35185185185185], [124.0, 169.08333333333331], [125.0, 185.26415094339623], [126.0, 146.74418604651163], [127.0, 218.41860465116278], [128.0, 126.3095238095238], [130.0, 252.88888888888889], [131.0, 151.18181818181822], [132.0, 184.13461538461536], [133.0, 185.24193548387098], [134.0, 173.06382978723403], [135.0, 142.29166666666666], [129.0, 132.0], [137.0, 144.82758620689654], [138.0, 191.99999999999997], [139.0, 178.74285714285716], [140.0, 180.37499999999997], [141.0, 134.1315789473684], [142.0, 138.48684210526318], [143.0, 132.1315789473684], [136.0, 127.64000000000001], [144.0, 175.3953488372093], [145.0, 185.39534883720935], [146.0, 154.53846153846152], [147.0, 216.67346938775515], [148.0, 154.0], [149.0, 200.0923076923077], [150.0, 175.16949152542375], [151.0, 191.44642857142856], [152.0, 168.9459459459459], [153.0, 173.6575342465753], [154.0, 176.41176470588232], [155.0, 210.17307692307688], [156.0, 155.90476190476184], [157.0, 183.73913043478262], [158.0, 128.0491803278689], [159.0, 173.6842105263158], [160.0, 194.0322580645161], [161.0, 185.71428571428575], [162.0, 181.90909090909088], [163.0, 162.0357142857143], [164.0, 204.76811594202897], [165.0, 176.2], [166.0, 234.52272727272722], [167.0, 136.7941176470588], [168.0, 219.5283018867924], [169.0, 183.46478873239442], [170.0, 190.90163934426224], [171.0, 245.9761904761905], [173.0, 183.95744680851064], [174.0, 98.63636363636361], [175.0, 190.0681818181818], [172.0, 198.97142857142856], [176.0, 205.44444444444443], [177.0, 208.51351351351352], [178.0, 230.42465753424653], [179.0, 213.89473684210526], [180.0, 184.47272727272724], [181.0, 186.86666666666667], [182.0, 126.45833333333337], [183.0, 117.57142857142857], [184.0, 154.90909090909096], [185.0, 179.95918367346937], [186.0, 222.10714285714278], [187.0, 230.3454545454545], [188.0, 233.64814814814815], [189.0, 246.1320754716981], [190.0, 209.60000000000002], [191.0, 236.89795918367355], [192.0, 128.28888888888886], [193.0, 232.2051282051282], [194.0, 214.6481481481481], [195.0, 246.45000000000002], [196.0, 205.24074074074082], [197.0, 235.80434782608697], [198.0, 236.14893617021278], [199.0, 259.5], [200.0, 237.18918918918916], [201.0, 329.40229885057465], [202.0, 358.58333333333326], [203.0, 381.15384615384613], [204.0, 237.61904761904762], [205.0, 253.8070175438596], [206.0, 245.5], [207.0, 236.90196078431376], [208.0, 270.6451612903227], [209.0, 268.97058823529414], [210.0, 308.35135135135124], [212.0, 240.5747126436782], [213.0, 241.33333333333331], [214.0, 179.1794871794872], [215.0, 276.48571428571427], [211.0, 301.93333333333334], [216.0, 273.98437499999994], [217.0, 191.5322580645161], [218.0, 237.7551020408163], [219.0, 206.41666666666666], [220.0, 177.39583333333326], [221.0, 164.37209302325584], [223.0, 268.2045454545456], [222.0, 391.8076923076923], [225.0, 252.1803278688525], [226.0, 229.69642857142856], [227.0, 323.36363636363626], [228.0, 206.91304347826087], [229.0, 294.8019801980198], [230.0, 252.04615384615386], [231.0, 291.0], [224.0, 258.9268292682927], [232.0, 171.53846153846152], [233.0, 188.60606060606062], [234.0, 227.9375], [235.0, 159.66666666666666], [236.0, 279.6229508196721], [237.0, 190.530612244898], [238.0, 214.8421052631579], [239.0, 214.44], [240.0, 247.07317073170736], [241.0, 195.93103448275858], [242.0, 202.28571428571428], [243.0, 300.60416666666663], [244.0, 312.87301587301585], [245.0, 314.47058823529414], [246.0, 335.4166666666667], [247.0, 239.91666666666666], [248.0, 210.45000000000002], [249.0, 300.87755102040813], [250.0, 294.14117647058816], [251.0, 305.41379310344814], [252.0, 273.8974358974359], [253.0, 175.74999999999997], [254.0, 232.7605633802817], [255.0, 170.10526315789474], [257.0, 257.7294117647059], [256.0, 338.030303030303], [258.0, 314.81395348837214], [259.0, 242.52083333333334], [260.0, 300.81333333333333], [261.0, 316.1714285714286], [262.0, 294.289156626506], [263.0, 337.99999999999994], [264.0, 206.28125000000003], [270.0, 347.75], [271.0, 282.39534883720944], [268.0, 295.02985074626866], [269.0, 265.6170212765957], [265.0, 307.1923076923077], [266.0, 421.4146341463414], [267.0, 369.10869565217394], [273.0, 376.5510204081633], [272.0, 306.8775510204081], [274.0, 220.5471698113208], [275.0, 318.54285714285714], [276.0, 226.7948717948718], [277.0, 321.0689655172413], [278.0, 214.42307692307693], [279.0, 405.6666666666667], [280.0, 374.50000000000006], [286.0, 338.8048780487804], [287.0, 440.0869565217393], [284.0, 223.68965517241378], [285.0, 411.2985074626866], [281.0, 410.3636363636364], [283.0, 499.95833333333337], [282.0, 500.99999999999994], [289.0, 239.53125], [288.0, 290.18367346938777], [290.0, 147.45454545454547], [291.0, 280.54098360655735], [292.0, 304.15217391304355], [293.0, 449.4411764705882], [294.0, 355.97058823529414], [295.0, 395.43529411764706], [296.0, 503.61016949152554], [302.0, 399.5616438356165], [303.0, 364.97196261682234], [300.0, 217.39999999999998], [301.0, 221.3214285714286], [297.0, 393.87837837837833], [298.0, 398.75000000000006], [299.0, 326.56250000000006], [307.0, 323.8906249999999], [305.0, 597.1538461538461], [304.0, 358.8424657534248], [311.0, 289.27777777777777], [310.0, 377.23529411764713], [306.0, 372.00000000000006], [308.0, 421.21428571428584], [309.0, 326.55000000000007], [313.0, 361.8333333333333], [312.0, 524.3076923076924], [318.0, 252.86363636363637], [319.0, 317.21739130434787], [316.0, 500.2987012987012], [317.0, 425.1551724137929], [314.0, 441.962962962963], [315.0, 463.6741573033708], [321.0, 483.00000000000006], [320.0, 336.59523809523796], [322.0, 292.0833333333334], [323.0, 327.17460317460313], [324.0, 322.72307692307686], [325.0, 308.83333333333326], [326.0, 361.4545454545454], [327.0, 413.56097560975604], [328.0, 359.2799999999999], [334.0, 292.09615384615387], [335.0, 492.02777777777777], [332.0, 308.2448979591837], [333.0, 395.56250000000006], [329.0, 278.62068965517244], [330.0, 334.5000000000001], [331.0, 486.1276595744681], [337.0, 583.7173913043479], [336.0, 355.1739130434782], [338.0, 430.95000000000005], [339.0, 542.8840579710144], [340.0, 437.3333333333333], [341.0, 383.48888888888894], [342.0, 351.4782608695653], [343.0, 305.33333333333337], [344.0, 240.89583333333331], [350.0, 345.08510638297867], [351.0, 423.5116279069767], [348.0, 304.3243243243243], [349.0, 298.1860465116279], [345.0, 336.7906976744186], [346.0, 313.67241379310343], [347.0, 349.2857142857144], [353.0, 352.54098360655735], [352.0, 340.3157894736843], [354.0, 336.08641975308655], [355.0, 279.16666666666663], [356.0, 251.17777777777778], [357.0, 312.52777777777777], [358.0, 255.44186046511624], [359.0, 284.337837837838], [360.0, 308.72], [366.0, 412.8524590163935], [367.0, 624.4523809523808], [364.0, 440.83582089552226], [365.0, 517.6619718309859], [361.0, 313.1568627450982], [362.0, 381.1568627450981], [363.0, 467.5070422535211], [369.0, 586.1666666666667], [368.0, 557.8431372549018], [370.0, 498.52941176470597], [371.0, 368.767441860465], [372.0, 240.8653846153846], [373.0, 391.41538461538465], [374.0, 399.70731707317077], [375.0, 435.02857142857147], [376.0, 308.43137254901956], [382.0, 368.9722222222222], [383.0, 329.4430379746836], [380.0, 360.735294117647], [381.0, 326.7118644067795], [377.0, 355.18367346938777], [378.0, 305.0208333333333], [379.0, 423.12765957446805], [385.0, 337.03], [384.0, 375.7831325301204], [386.0, 326.87096774193554], [387.0, 310.4838709677419], [388.0, 279.5], [389.0, 272.7466666666667], [390.0, 279.536231884058], [391.0, 207.6428571428571], [394.0, 394.50000000000006], [396.0, 606.5254237288135], [397.0, 282.9090909090909], [398.0, 336.9259259259259], [399.0, 451.2222222222223], [393.0, 582.8000000000001], [392.0, 420.3414634146342], [395.0, 462.890625], [412.0, 468.9361702127659], [400.0, 467.4807692307693], [401.0, 668.0888888888887], [403.0, 598.5125], [402.0, 599.7647058823526], [406.0, 566.3695652173913], [405.0, 560.8648648648648], [404.0, 585.2199999999999], [407.0, 602.235294117647], [408.0, 498.4705882352941], [409.0, 617.2380952380952], [410.0, 335.39130434782606], [411.0, 490.8787878787878], [413.0, 308.391304347826], [414.0, 326.15094339622635], [415.0, 311.14814814814804], [417.0, 352.57142857142856], [416.0, 252.16363636363639], [418.0, 403.14705882352933], [419.0, 354.11666666666656], [420.0, 464.91836734693874], [421.0, 538.8148148148147], [422.0, 400.9814814814815], [423.0, 443.47272727272724], [424.0, 451.90909090909093], [430.0, 382.91891891891885], [431.0, 424.7391304347826], [428.0, 324.22727272727275], [429.0, 527.7441860465116], [425.0, 308.2608695652174], [426.0, 328.76595744680844], [427.0, 415.21153846153834], [433.0, 575.0930232558139], [432.0, 355.2179487179486], [434.0, 592.0487804878048], [435.0, 428.33734939759034], [436.0, 543.6666666666666], [437.0, 565.5957446808511], [438.0, 806.4666666666667], [439.0, 627.5714285714286], [440.0, 790.3000000000002], [446.0, 692.5526315789473], [447.0, 409.1538461538462], [444.0, 756.6363636363637], [445.0, 559.2888888888889], [441.0, 560.6136363636365], [442.0, 274.1388888888889], [443.0, 550.05], [449.0, 432.51428571428573], [448.0, 857.8333333333334], [451.0, 614.8936170212767], [450.0, 759.8333333333334], [460.0, 384.77966101694915], [461.0, 588.6153846153846], [462.0, 714.0434782608695], [463.0, 458.4000000000001], [452.0, 465.1176470588234], [453.0, 514.2272727272727], [454.0, 733.5625000000001], [455.0, 497.4722222222222], [456.0, 624.1818181818181], [457.0, 552.3098591549295], [458.0, 932.891891891892], [459.0, 621.9999999999999], [465.0, 703.3064516129032], [464.0, 641.2711864406779], [466.0, 466.31168831168816], [467.0, 457.0877192982456], [468.0, 474.625], [469.0, 649.4666666666666], [470.0, 412.8285714285714], [471.0, 604.1153846153844], [472.0, 560.0754716981135], [478.0, 236.05555555555557], [479.0, 262.21333333333337], [476.0, 575.3283582089554], [477.0, 371.795918367347], [473.0, 581.810344827586], [474.0, 527.76], [475.0, 616.2499999999997], [481.0, 1132.7586206896551], [480.0, 544.139534883721], [482.0, 472.41935483870964], [483.0, 454.79710144927526], [484.0, 415.3], [485.0, 688.1964285714287], [486.0, 392.6], [487.0, 462.8421052631579], [488.0, 681.2424242424244], [495.0, 279.4642857142857], [494.0, 312.3636363636364], [492.0, 541.6444444444444], [493.0, 528.4545454545455], [489.0, 849.8125000000001], [490.0, 338.30487804878055], [491.0, 1160.4761904761906], [498.0, 532.5833333333334], [499.0, 716.4814814814815], [508.0, 660.1428571428572], [509.0, 995.0952380952381], [510.0, 1644.5357142857142], [511.0, 694.632911392405], [500.0, 488.1176470588234], [501.0, 708.1730769230769], [502.0, 515.3207547169811], [503.0, 689.639534883721], [497.0, 559.8387096774195], [496.0, 198.6428571428572], [504.0, 755.6547619047622], [505.0, 729.1773399014778], [506.0, 871.9750000000003], [507.0, 1016.9384615384618], [515.0, 708.7407407407408], [512.0, 987.8571428571427], [526.0, 745.0555555555554], [527.0, 668.1016949152541], [524.0, 564.2916666666666], [525.0, 370.09090909090907], [522.0, 429.2653061224491], [523.0, 575.4655172413793], [513.0, 972.1250000000001], [514.0, 643.1428571428572], [516.0, 1196.52], [517.0, 1098.2631578947369], [518.0, 606.1666666666666], [519.0, 678.758620689655], [528.0, 995.45], [542.0, 1063.0], [543.0, 667.8499999999999], [540.0, 622.0232558139535], [541.0, 627.9047619047619], [538.0, 517.16], [539.0, 585.0897435897436], [536.0, 451.46153846153834], [537.0, 639.5434782608697], [529.0, 660.132075471698], [530.0, 563.7358490566038], [531.0, 716.741935483871], [532.0, 500.1451612903225], [533.0, 398.3478260869565], [534.0, 652.0925925925924], [535.0, 565.2978723404256], [520.0, 539.2121212121212], [521.0, 470.43333333333334], [550.0, 705.3230769230769], [546.0, 1020.2499999999999], [544.0, 463.5641025641026], [545.0, 912.4516129032257], [558.0, 533.2631578947368], [559.0, 646.0857142857143], [556.0, 731.8125000000001], [557.0, 437.1749999999999], [554.0, 767.4], [555.0, 788.9047619047619], [547.0, 920.3648648648651], [548.0, 736.8936170212766], [549.0, 810.9393939393941], [551.0, 800.5818181818181], [568.0, 696.6222222222223], [569.0, 563.2988505747128], [570.0, 824.4415584415584], [571.0, 666.0806451612902], [572.0, 590.3809523809524], [573.0, 765.1886792452831], [574.0, 620.830769230769], [575.0, 704.4848484848485], [560.0, 537.3999999999999], [561.0, 715.2499999999998], [562.0, 486.9574468085106], [563.0, 695.6153846153848], [564.0, 796.0493827160495], [565.0, 749.2631578947368], [566.0, 786.3157894736843], [567.0, 779.0000000000001], [552.0, 708.9772727272727], [553.0, 901.8266666666668], [579.0, 548.1333333333333], [576.0, 745.4807692307692], [590.0, 686.5842696629212], [591.0, 579.0], [588.0, 578.5849056603773], [589.0, 528.0204081632653], [586.0, 434.7045454545454], [587.0, 680.1076923076923], [577.0, 443.11999999999995], [578.0, 629.8611111111111], [580.0, 438.2222222222222], [581.0, 419.7567567567567], [582.0, 404.3863636363636], [583.0, 354.93877551020415], [592.0, 655.8000000000001], [606.0, 806.2258064516128], [607.0, 626.4000000000001], [604.0, 474.45833333333337], [605.0, 578.205882352941], [602.0, 475.5454545454544], [603.0, 562.8518518518518], [600.0, 657.5357142857142], [601.0, 779.6999999999999], [593.0, 413.28205128205127], [594.0, 700.8225806451615], [595.0, 605.7878787878788], [596.0, 701.5529411764705], [597.0, 706.0405405405404], [598.0, 759.2432432432433], [599.0, 554.7058823529412], [584.0, 593.7446808510639], [585.0, 426.38775510204067], [614.0, 706.4594594594595], [619.0, 611.6415094339624], [615.0, 645.0909090909091], [632.0, 476.6119402985075], [633.0, 636.0746268656718], [634.0, 817.7543859649122], [635.0, 440.99999999999994], [636.0, 1374.7666666666669], [637.0, 464.82300884955725], [638.0, 429.90697674418595], [639.0, 413.99999999999994], [624.0, 409.28571428571433], [625.0, 577.4516129032256], [626.0, 1160.3749999999998], [627.0, 1139.5000000000002], [628.0, 614.1785714285713], [629.0, 792.6304347826086], [630.0, 445.35211267605627], [631.0, 722.0563380281687], [616.0, 755.6764705882354], [617.0, 846.4431818181819], [618.0, 781.125], [620.0, 816.6666666666666], [621.0, 492.47826086956525], [622.0, 521.529411764706], [623.0, 553.68], [613.0, 778.9122807017546], [612.0, 903.45], [611.0, 808.818181818182], [610.0, 858.4193548387096], [609.0, 840.032258064516], [608.0, 812.7564102564102], [643.0, 655.9047619047618], [640.0, 538.5438596491227], [654.0, 598.3623188405797], [655.0, 678.6285714285714], [652.0, 530.8857142857144], [653.0, 560.7758620689655], [650.0, 745.8461538461538], [651.0, 855.2812500000001], [641.0, 650.625], [642.0, 653.113924050633], [644.0, 489.57534246575347], [645.0, 610.2051282051282], [646.0, 682.3188405797102], [647.0, 433.10256410256403], [657.0, 1045.0], [656.0, 659.3513513513516], [670.0, 665.9358974358977], [671.0, 616.6065573770492], [668.0, 300.6800000000001], [669.0, 350.054794520548], [666.0, 589.9325842696628], [667.0, 559.75], [664.0, 649.725806451613], [665.0, 621.551724137931], [658.0, 768.4313725490197], [660.0, 605.7906976744188], [659.0, 928.6206896551723], [661.0, 893.6124999999998], [662.0, 650.7073170731707], [663.0, 918.5744680851064], [648.0, 453.5540540540541], [649.0, 686.9230769230769], [675.0, 570.6461538461538], [672.0, 604.8305084745764], [686.0, 769.1724137931033], [687.0, 485.8620689655172], [684.0, 621.2537313432836], [685.0, 647.9545454545454], [682.0, 438.89583333333326], [683.0, 525.4285714285714], [673.0, 594.8301886792451], [674.0, 534.016393442623], [676.0, 670.0277777777776], [677.0, 879.6346153846155], [678.0, 591.7959183673469], [679.0, 363.8928571428571], [688.0, 629.5394736842106], [702.0, 666.5555555555558], [703.0, 760.2000000000002], [700.0, 771.3783783783782], [701.0, 1108.5384615384614], [698.0, 757.8913043478261], [699.0, 690.7142857142854], [696.0, 894.3650793650792], [697.0, 736.2826086956524], [689.0, 584.6956521739129], [690.0, 462.8977272727272], [691.0, 589.4000000000002], [692.0, 593.0384615384614], [693.0, 633.3294117647057], [694.0, 729.0877192982457], [695.0, 939.9634146341465], [680.0, 396.3829787234043], [681.0, 339.3442622950819], [707.0, 1249.833333333333], [704.0, 769.8333333333334], [718.0, 420.55102040816337], [719.0, 438.86075949367086], [716.0, 331.3606557377049], [717.0, 336.55], [714.0, 825.2121212121212], [715.0, 677.8923076923078], [705.0, 374.94444444444434], [706.0, 543.310344827586], [708.0, 1569.2758620689656], [709.0, 574.135135135135], [710.0, 926.8644067796612], [711.0, 451.8285714285715], [720.0, 760.6], [729.0, 894.5277777777776], [728.0, 786.1372549019608], [730.0, 992.9090909090905], [731.0, 1261.7924528301887], [732.0, 951.8513513513514], [733.0, 757.5], [734.0, 1051.2026143790845], [735.0, 696.6027397260274], [721.0, 528.9722222222223], [723.0, 640.3333333333333], [722.0, 564.7307692307693], [725.0, 414.22222222222223], [724.0, 682.7272727272727], [727.0, 1110.413043478261], [726.0, 724.4655172413792], [712.0, 864.8510638297872], [713.0, 683.3955223880597], [739.0, 922.3409090909087], [736.0, 1047.5740740740744], [750.0, 501.4558823529411], [751.0, 523.9473684210525], [748.0, 454.0366972477063], [749.0, 721.8604651162791], [746.0, 772.6111111111111], [747.0, 501.6808510638298], [737.0, 960.88], [738.0, 1050.7254901960787], [740.0, 709.5873015873015], [741.0, 550.2352941176471], [742.0, 357.93750000000006], [743.0, 632.4444444444445], [752.0, 625.4878048780487], [766.0, 565.6315789473684], [767.0, 1109.8709677419358], [764.0, 739.4347826086957], [765.0, 765.173333333333], [762.0, 960.5769230769231], [763.0, 982.9166666666665], [760.0, 612.7499999999999], [761.0, 818.6086956521739], [753.0, 876.4603174603175], [754.0, 693.6530612244896], [755.0, 765.7826086956521], [756.0, 604.6326530612246], [757.0, 875.3833333333334], [758.0, 707.8936170212768], [759.0, 613.7169811320756], [744.0, 591.8333333333333], [745.0, 688.6000000000003], [771.0, 969.0000000000001], [768.0, 950.9545454545454], [782.0, 594.8979591836736], [783.0, 1141.313725490196], [780.0, 1038.6190476190475], [781.0, 940.7959183673471], [778.0, 718.4482758620691], [779.0, 1230.3469387755101], [769.0, 1343.8732394366193], [770.0, 1396.7894736842106], [772.0, 1576.8095238095239], [773.0, 1451.3333333333335], [774.0, 1457.9230769230774], [775.0, 1425.673076923077], [784.0, 668.1836734693879], [798.0, 893.1739130434785], [799.0, 776.775], [796.0, 536.6521739130436], [797.0, 676.9444444444445], [794.0, 706.9777777777778], [795.0, 740.1129032258063], [792.0, 667.2], [793.0, 701.5535714285712], [785.0, 927.840909090909], [786.0, 738.4893617021276], [787.0, 757.6301369863014], [788.0, 732.1692307692309], [789.0, 420.65625000000006], [790.0, 760.9076923076921], [791.0, 793.5657894736843], [776.0, 1298.6458333333333], [777.0, 1097.4999999999995], [803.0, 568.2162162162163], [800.0, 559.7000000000002], [815.0, 1259.8777777777775], [812.0, 797.4999999999999], [813.0, 1375.7874999999995], [814.0, 1122.4871794871792], [810.0, 626.1999999999998], [811.0, 709.68], [801.0, 510.86956521739137], [802.0, 648.4054054054055], [804.0, 586.6226415094338], [805.0, 864.3333333333333], [806.0, 978.5806451612902], [807.0, 825.7222222222222], [816.0, 1234.2857142857144], [830.0, 1225.4042553191491], [831.0, 812.9859154929575], [828.0, 1063.8255813953485], [829.0, 1200.0677966101694], [826.0, 1210.2597402597396], [827.0, 1049.6774193548385], [824.0, 1010.1111111111112], [825.0, 935.4800000000001], [817.0, 1357.8947368421054], [818.0, 1131.1830985915494], [819.0, 1104.0], [820.0, 1095.6074074074074], [821.0, 1216.309090909091], [822.0, 807.3125000000001], [823.0, 709.9166666666667], [808.0, 1242.5714285714284], [809.0, 821.4000000000001], [858.0, 993.5365853658541], [847.0, 703.6960784313725], [832.0, 708.4473684210527], [834.0, 659.3000000000001], [833.0, 888.0999999999999], [836.0, 592.0000000000001], [837.0, 761.6216216216217], [835.0, 653.2142857142856], [839.0, 658.4444444444449], [838.0, 667.6571428571427], [856.0, 510.33333333333314], [857.0, 734.2325581395348], [859.0, 663.9714285714286], [860.0, 753.8064516129034], [861.0, 605.0178571428572], [862.0, 499.1836734693878], [863.0, 489.20338983050846], [842.0, 991.5599999999998], [841.0, 915.6571428571427], [840.0, 968.6969696969697], [843.0, 541.2777777777777], [844.0, 708.2666666666667], [845.0, 926.1304347826086], [846.0, 877.8938053097347], [848.0, 787.4102564102564], [849.0, 841.044642857143], [850.0, 752.0], [851.0, 814.1774193548383], [852.0, 1000.2916666666665], [853.0, 643.1249999999999], [854.0, 795.5000000000001], [855.0, 666.8499999999997], [867.0, 899.081081081081], [864.0, 636.2291666666665], [878.0, 735.3787878787878], [879.0, 682.9019607843136], [876.0, 849.4901960784314], [877.0, 691.6406250000001], [874.0, 502.3541666666667], [875.0, 644.7142857142857], [865.0, 781.157894736842], [866.0, 673.2173913043478], [868.0, 645.2545454545453], [869.0, 488.0729166666667], [870.0, 634.4909090909091], [871.0, 615.9464285714287], [880.0, 894.6545454545453], [894.0, 655.3400000000001], [895.0, 794.4166666666666], [892.0, 697.8787878787878], [893.0, 698.622222222222], [890.0, 719.6486486486485], [891.0, 700.6344086021503], [888.0, 661.4177215189873], [889.0, 787.1400000000002], [881.0, 607.8923076923076], [882.0, 564.9152542372882], [883.0, 668.8518518518515], [884.0, 675.2105263157895], [885.0, 755.8767123287672], [886.0, 582.0000000000002], [887.0, 844.5757575757576], [872.0, 633.5272727272725], [873.0, 601.3466666666667], [899.0, 854.7027027027027], [896.0, 789.4677419354838], [910.0, 896.9999999999999], [911.0, 960.9661016949154], [908.0, 1109.0000000000002], [909.0, 1140.3999999999999], [906.0, 587.7333333333335], [907.0, 682.6176470588236], [897.0, 681.560975609756], [898.0, 885.659574468085], [900.0, 926.7249999999999], [901.0, 827.90243902439], [902.0, 812.7288135593219], [903.0, 929.7894736842105], [912.0, 871.9999999999999], [926.0, 1655.5135135135142], [927.0, 1088.0750000000005], [924.0, 1052.220779220779], [925.0, 814.5892857142858], [922.0, 993.8493150684935], [923.0, 1022.8412698412699], [920.0, 1045.9900000000002], [921.0, 1027.6557377049182], [913.0, 944.0384615384615], [914.0, 946.4657534246577], [915.0, 814.271186440678], [916.0, 743.7333333333333], [917.0, 1049.5492957746476], [918.0, 1024.6071428571427], [919.0, 785.2528735632184], [904.0, 605.7317073170732], [905.0, 509.05], [931.0, 1439.418604651163], [928.0, 1104.462686567164], [943.0, 749.5208333333333], [941.0, 878.15], [942.0, 983.2558139534887], [939.0, 1091.754716981132], [940.0, 863.6851851851851], [929.0, 1038.4761904761906], [930.0, 1002.1538461538464], [932.0, 1116.3125], [933.0, 1036.2972972972973], [934.0, 1483.5789473684213], [935.0, 1105.8148148148148], [944.0, 1019.4666666666669], [955.0, 1032.787234042553], [954.0, 1200.3055555555552], [953.0, 843.1951219512194], [952.0, 1212.092592592593], [956.0, 1069.8846153846152], [957.0, 1300.4313725490197], [958.0, 1038.0967741935485], [959.0, 1281.3488372093025], [945.0, 1184.2266666666665], [947.0, 1543.9411764705883], [946.0, 903.3000000000001], [949.0, 1561.4285714285716], [948.0, 1101.7500000000002], [951.0, 1658.392857142857], [950.0, 1328.8], [936.0, 983.2903225806452], [937.0, 1068.0], [938.0, 782.92], [963.0, 1228.0759493670882], [960.0, 1041.372881355933], [975.0, 1532.6590909090914], [973.0, 1522.2500000000002], [972.0, 1503.7878787878783], [974.0, 1165.9565217391305], [970.0, 1259.5714285714284], [971.0, 1333.906976744186], [961.0, 1264.0714285714287], [962.0, 1056.051282051282], [964.0, 1684.6190476190477], [965.0, 1021.2328767123289], [966.0, 1391.589285714286], [967.0, 1401.880952380952], [976.0, 1233.9714285714279], [990.0, 1295.2093023255816], [991.0, 1926.9333333333336], [988.0, 1438.0625], [989.0, 897.2187500000001], [986.0, 915.6666666666669], [987.0, 1435.979591836735], [984.0, 1060.5362318840578], [985.0, 1471.509803921569], [977.0, 1107.9565217391303], [978.0, 1494.5789473684213], [979.0, 1249.9444444444441], [980.0, 1328.75], [981.0, 1290.9583333333333], [982.0, 1087.54], [983.0, 1186.4861111111109], [968.0, 1009.5714285714286], [969.0, 1300.1449275362318], [995.0, 1567.6666666666667], [992.0, 1848.4634146341457], [1006.0, 1185.5777777777773], [1007.0, 1306.6000000000001], [1004.0, 916.1224489795917], [1005.0, 1409.2682926829266], [1002.0, 873.9622641509434], [1003.0, 787.295081967213], [993.0, 2658.5000000000014], [994.0, 1569.0930232558142], [996.0, 2679.5000000000005], [997.0, 1281.46875], [998.0, 756.2686567164178], [999.0, 795.2045454545452], [1008.0, 1235.34], [1022.0, 1446.7573529411766], [1023.0, 1511.6406249999995], [1020.0, 1492.4], [1021.0, 1475.058139534884], [1018.0, 1192.0898876404497], [1019.0, 1361.6451612903224], [1016.0, 1063.3333333333335], [1017.0, 1022.9374999999999], [1009.0, 970.1935483870967], [1010.0, 1229.826086956522], [1011.0, 931.7586206896552], [1012.0, 1030.0], [1013.0, 1058.3055555555554], [1014.0, 1074.1632653061224], [1015.0, 1000.5714285714287], [1000.0, 1032.7800000000004], [1001.0, 943.75], [1030.0, 1245.1481481481483], [1024.0, 1381.8301886792453], [1052.0, 715.8666666666666], [1054.0, 1132.3111111111114], [1048.0, 1149.9830508474581], [1050.0, 930.0526315789474], [1044.0, 1014.0704225352117], [1046.0, 1086.260869565217], [1026.0, 1093.438596491228], [1028.0, 1367.5365853658536], [1032.0, 1007.9032258064515], [1034.0, 1303.4814814814815], [1036.0, 1123.5671641791043], [1038.0, 1074.0754716981128], [1062.0, 1146.698113207547], [1060.0, 1146.9230769230767], [1058.0, 941.736842105263], [1056.0, 1027.406779661017], [1084.0, 1067.2903225806451], [1086.0, 1063.0196078431372], [1080.0, 895.7037037037038], [1082.0, 1087.544117647059], [1076.0, 948.3947368421052], [1078.0, 1403.1052631578946], [1072.0, 911.4444444444443], [1074.0, 1156.1395348837211], [1064.0, 973.6666666666666], [1066.0, 959.8703703703706], [1068.0, 1010.9821428571431], [1070.0, 1416.2372881355932], [1040.0, 852.8593749999998], [1042.0, 872.4074074074076], [1094.0, 1148.82], [1088.0, 838.9600000000002], [1116.0, 971.9130434782611], [1118.0, 1244.5625000000002], [1112.0, 1666.764705882353], [1114.0, 1158.2826086956525], [1108.0, 1191.0270270270273], [1110.0, 1038.8529411764705], [1090.0, 2026.0344827586212], [1092.0, 1075.3555555555558], [1096.0, 996.0196078431372], [1098.0, 1299.5072463768113], [1100.0, 1378.1818181818185], [1102.0, 1127.4347826086957], [1120.0, 2094.8913043478265], [1148.0, 855.0298507462688], [1150.0, 493.38000000000017], [1144.0, 774.6590909090908], [1146.0, 791.2666666666668], [1140.0, 921.048780487805], [1142.0, 997.5050505050508], [1136.0, 1536.0298507462687], [1138.0, 1433.7222222222226], [1122.0, 1462.4054054054047], [1124.0, 1310.192307692308], [1126.0, 1590.0654205607473], [1128.0, 1744.6986301369855], [1130.0, 1510.7657657657658], [1132.0, 1912.9803921568625], [1134.0, 1452.894736842105], [1104.0, 1411.0454545454547], [1106.0, 1262.5555555555557], [1154.0, 1101.9999999999995], [1174.0, 1087.459770114942], [1152.0, 799.3380281690143], [1180.0, 1360.6956521739123], [1182.0, 1208.4750000000004], [1156.0, 1172.2285714285708], [1160.0, 1006.8333333333333], [1158.0, 970.1500000000001], [1164.0, 937.7435897435898], [1162.0, 975.8666666666667], [1166.0, 1034.5624999999998], [1184.0, 1076.1323529411768], [1212.0, 1249.5862068965519], [1214.0, 1234.10294117647], [1208.0, 1274.44], [1210.0, 1454.4], [1204.0, 1148.9615384615388], [1206.0, 1335.0363636363636], [1200.0, 2041.2542372881362], [1202.0, 1368.0000000000002], [1186.0, 1434.4545454545457], [1188.0, 1263.333333333333], [1190.0, 1038.5357142857142], [1192.0, 1382.7948717948718], [1194.0, 1548.5476190476193], [1196.0, 1336.2857142857142], [1198.0, 879.3915343915345], [1168.0, 834.5362318840579], [1170.0, 1087.3333333333335], [1172.0, 1100.2608695652175], [1176.0, 1206.4999999999998], [1178.0, 1462.6571428571433], [1222.0, 1008.6825396825398], [1216.0, 1111.294117647059], [1244.0, 1225.913793103448], [1246.0, 1561.222222222222], [1240.0, 1244.6199999999997], [1242.0, 1527.7460317460316], [1236.0, 1379.4430379746834], [1238.0, 1141.6000000000006], [1218.0, 1377.5438596491226], [1220.0, 1177.781609195402], [1224.0, 1363.3378378378377], [1226.0, 1273.685714285714], [1228.0, 1314.6774193548388], [1230.0, 1125.595744680851], [1248.0, 1195.1752577319583], [1276.0, 1417.6258992805756], [1278.0, 975.0256410256408], [1272.0, 1455.9545454545455], [1274.0, 858.5529411764705], [1268.0, 1118.5842696629218], [1266.0, 1444.2911392405067], [1264.0, 1263.6811594202898], [1270.0, 1400.375], [1250.0, 1345.3921568627454], [1252.0, 1623.8076923076924], [1254.0, 1279.4285714285716], [1256.0, 623.7619047619049], [1258.0, 1275.826086956522], [1262.0, 1469.7800000000002], [1260.0, 1437.2374999999995], [1232.0, 1573.553571428571], [1234.0, 902.1573033707865], [1286.0, 1081.9861111111113], [1280.0, 1064.5714285714287], [1308.0, 699.6956521739132], [1310.0, 1384.9642857142858], [1304.0, 1149.1428571428564], [1306.0, 1731.8846153846148], [1300.0, 1600.7500000000002], [1302.0, 1712.5555555555554], [1282.0, 932.188524590164], [1284.0, 1032.175], [1288.0, 1367.4375000000005], [1290.0, 1278.2551020408164], [1292.0, 1057.5185185185187], [1294.0, 1019.9638554216866], [1312.0, 1067.1111111111113], [1314.0, 1078.3333333333335], [1316.0, 1282.835365853659], [1318.0, 1572.5249999999999], [1320.0, 2572.120000000001], [1322.0, 1245.7656249999995], [1324.0, 1488.8836703186305], [1296.0, 1121.2222222222217], [1298.0, 1233.981818181818], [1039.0, 876.920634920635], [1031.0, 1011.0999999999999], [1025.0, 1533.7076923076918], [1055.0, 777.7600000000001], [1053.0, 1137.3137254901962], [1049.0, 1149.6630434782596], [1051.0, 960.3846153846155], [1045.0, 981.1515151515151], [1047.0, 790.3170731707315], [1027.0, 1086.0923076923077], [1029.0, 1180.3823529411764], [1033.0, 1036.5], [1035.0, 867.232558139535], [1037.0, 952.0888888888886], [1059.0, 1603.0000000000002], [1057.0, 1010.8235294117648], [1061.0, 1080.009900990099], [1085.0, 879.7460317460317], [1087.0, 1313.8372093023258], [1081.0, 1090.5333333333335], [1083.0, 1873.9999999999998], [1077.0, 1456.5647058823536], [1079.0, 1007.3678160919542], [1073.0, 962.2739726027395], [1075.0, 1406.6000000000004], [1063.0, 762.0], [1065.0, 1038.861111111111], [1067.0, 1177.255813953488], [1069.0, 1403.4031007751935], [1071.0, 1178.84126984127], [1041.0, 872.1463414634147], [1043.0, 1106.0769230769229], [1095.0, 935.3749999999999], [1089.0, 1014.3898305084746], [1119.0, 1339.7291666666665], [1115.0, 1453.275862068966], [1117.0, 1102.6470588235297], [1111.0, 1563.4333333333332], [1113.0, 1070.0294117647059], [1091.0, 1841.6600000000005], [1093.0, 1192.204081632653], [1097.0, 1251.8421052631581], [1099.0, 1089.8076923076922], [1101.0, 1208.5999999999995], [1103.0, 1355.4], [1121.0, 1015.1666666666669], [1149.0, 603.28], [1151.0, 799.48], [1145.0, 996.7333333333335], [1147.0, 826.1309523809524], [1141.0, 1261.4666666666665], [1143.0, 1038.2615384615385], [1137.0, 1675.8783783783783], [1139.0, 1149.3275862068965], [1123.0, 1491.880341880342], [1125.0, 1522.010752688172], [1127.0, 1764.0681818181818], [1129.0, 1711.1309523809523], [1131.0, 1989.6065573770488], [1133.0, 1336.5454545454547], [1135.0, 1388.703703703703], [1107.0, 1484.4722222222222], [1105.0, 1095.1666666666667], [1109.0, 1060.9032258064515], [1155.0, 1584.1372549019604], [1175.0, 1503.8947368421057], [1153.0, 1037.8493150684933], [1181.0, 879.6440677966102], [1183.0, 1004.9800000000001], [1167.0, 1257.8870967741939], [1165.0, 1334.9523809523812], [1163.0, 1354.952380952381], [1161.0, 791.4117647058824], [1159.0, 952.0], [1157.0, 952.2903225806454], [1201.0, 1509.3846153846155], [1203.0, 1330.9], [1205.0, 1138.8833333333332], [1207.0, 2185.0232558139537], [1209.0, 1001.8035714285713], [1211.0, 630.8749999999999], [1213.0, 1291.426829268293], [1215.0, 1273.3333333333333], [1185.0, 1145.388888888889], [1187.0, 966.4137931034485], [1189.0, 1097.2333333333333], [1191.0, 1196.9218749999998], [1193.0, 1520.8636363636363], [1195.0, 1511.1555555555558], [1197.0, 1834.1521739130435], [1199.0, 1578.219512195122], [1169.0, 647.6333333333333], [1171.0, 1126.5428571428572], [1173.0, 1032.2692307692307], [1177.0, 1469.928571428572], [1179.0, 1073.0285714285715], [1223.0, 1064.6774193548385], [1217.0, 1226.5054945054944], [1245.0, 1291.3829787234038], [1247.0, 1121.2452830188674], [1241.0, 1240.4374999999998], [1243.0, 1656.9069767441858], [1237.0, 1045.5315315315322], [1239.0, 1048.7014925373132], [1219.0, 1531.7681159420288], [1221.0, 1271.8333333333335], [1225.0, 1258.450980392157], [1227.0, 1358.3359374999998], [1229.0, 1166.3333333333333], [1231.0, 1137.6666666666665], [1249.0, 1316.5423728813557], [1277.0, 1542.0803571428564], [1279.0, 1301.3684210526317], [1273.0, 1175.5877862595419], [1275.0, 1326.3062500000005], [1269.0, 1180.7499999999995], [1267.0, 1344.5352112676062], [1265.0, 1296.021739130435], [1271.0, 1490.1562499999998], [1251.0, 2209.631578947369], [1253.0, 896.1379310344828], [1255.0, 678.8717948717948], [1257.0, 1452.9333333333334], [1259.0, 1223.2962962962965], [1263.0, 1418.9863013698634], [1261.0, 1254.3888888888891], [1233.0, 1389.709090909091], [1235.0, 1281.4126984126983], [1287.0, 1147.7843137254908], [1281.0, 1060.1081081081081], [1309.0, 1236.0800000000002], [1311.0, 1134.4794520547946], [1305.0, 1657.675675675676], [1307.0, 1060.842105263158], [1301.0, 1806.8414634146332], [1303.0, 1563.0370370370374], [1283.0, 1033.8350515463917], [1285.0, 1026.0847457627117], [1289.0, 1610.3650793650797], [1291.0, 1089.470588235294], [1293.0, 984.9042553191487], [1295.0, 1236.8962264150946], [1313.0, 1082.3098591549294], [1315.0, 1126.275641025641], [1317.0, 1579.4120603015074], [1319.0, 1581.475177304964], [1321.0, 1533.2156862745094], [1323.0, 1781.1126760563386], [1297.0, 2069.0000000000005], [1299.0, 1263.2717391304348], [1.0, 3.8888888888888884]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1078.1350677220655, 1198.8630334762083]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1324.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 29387.766666666666, "minX": 1.549803E12, "maxY": 304040.31666666665, "series": [{"data": [[1.54980336E12, 304040.31666666665], [1.54980306E12, 297463.56666666665], [1.54980342E12, 110064.43333333333], [1.54980312E12, 174168.38333333333], [1.5498033E12, 136006.38333333333], [1.549803E12, 75458.88333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54980336E12, 131306.25], [1.54980306E12, 130052.16666666667], [1.54980342E12, 29387.766666666666], [1.54980312E12, 51472.05], [1.5498033E12, 59463.416666666664], [1.549803E12, 32991.083333333336]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54980342E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 391.6336469702669, "minX": 1.549803E12, "maxY": 1484.1656411611434, "series": [{"data": [[1.54980336E12, 1484.1656411611434], [1.54980306E12, 1447.8963337788825], [1.54980342E12, 976.2951032899736], [1.54980312E12, 1142.3091478416327], [1.5498033E12, 645.0727082898308], [1.549803E12, 391.6336469702669]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54980342E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 391.62920587128133, "minX": 1.549803E12, "maxY": 1483.9426408969023, "series": [{"data": [[1.54980336E12, 1483.9426408969023], [1.54980306E12, 1447.8863853351193], [1.54980342E12, 966.9022953328227], [1.54980312E12, 1119.656631626024], [1.5498033E12, 645.0713301315525], [1.549803E12, 391.62920587128133]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54980342E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.05608686573397359, "minX": 1.549803E12, "maxY": 45.73755312010742, "series": [{"data": [[1.54980336E12, 0.4880336718130677], [1.54980306E12, 0.12539621920947097], [1.54980342E12, 32.80788064269316], [1.54980312E12, 45.73755312010742], [1.5498033E12, 0.05608686573397359], [1.549803E12, 0.08121942039894609]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54980342E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 3.0, "minX": 1.549803E12, "maxY": 19955.0, "series": [{"data": [[1.54980336E12, 6672.0], [1.54980306E12, 19955.0], [1.54980342E12, 7032.0], [1.54980312E12, 4548.0], [1.5498033E12, 4733.0], [1.549803E12, 9142.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54980336E12, 151.0], [1.54980306E12, 15.0], [1.54980342E12, 4.0], [1.54980312E12, 4.0], [1.5498033E12, 3.0], [1.549803E12, 11.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54980336E12, 2748.0], [1.54980306E12, 2464.0], [1.54980342E12, 2594.0], [1.54980312E12, 2323.0], [1.5498033E12, 1697.0], [1.549803E12, 745.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54980336E12, 3985.0], [1.54980306E12, 3644.9900000000016], [1.54980342E12, 4053.980000000003], [1.54980312E12, 3365.950000000008], [1.5498033E12, 2908.0], [1.549803E12, 4526.119999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54980336E12, 3227.0], [1.54980306E12, 2882.0], [1.54980342E12, 3066.9000000000015], [1.54980312E12, 2716.9500000000007], [1.5498033E12, 2143.9500000000007], [1.549803E12, 1010.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54980342E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 58.0, "minX": 217.0, "maxY": 1373.0, "series": [{"data": [[372.0, 1112.0], [399.0, 565.0], [221.0, 230.0], [872.0, 1373.0], [883.0, 1234.0], [217.0, 807.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[372.0, 147.0], [883.0, 106.0], [217.0, 58.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 883.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 217.0, "maxY": 1373.0, "series": [{"data": [[372.0, 1112.0], [399.0, 565.0], [221.0, 230.0], [872.0, 1373.0], [883.0, 1234.0], [217.0, 807.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[372.0, 0.0], [883.0, 0.0], [217.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 883.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 195.78333333333333, "minX": 1.549803E12, "maxY": 885.05, "series": [{"data": [[1.54980336E12, 885.05], [1.54980306E12, 882.2166666666667], [1.54980342E12, 195.78333333333333], [1.54980312E12, 350.51666666666665], [1.5498033E12, 419.1166666666667], [1.549803E12, 234.1]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54980342E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.7833333333333334, "minX": 1.549803E12, "maxY": 881.25, "series": [{"data": [[1.54980336E12, 881.25], [1.54980306E12, 872.8333333333334], [1.54980342E12, 197.23333333333332], [1.54980312E12, 345.45], [1.5498033E12, 399.0833333333333], [1.549803E12, 221.41666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.54980336E12, 1.7833333333333334], [1.54980342E12, 20.6], [1.54980312E12, 27.133333333333333]], "isOverall": false, "label": "Non HTTP response code: java.net.NoRouteToHostException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54980342E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.7833333333333334, "minX": 1.549803E12, "maxY": 881.25, "series": [{"data": [[1.54980336E12, 881.25], [1.54980306E12, 872.8333333333334], [1.54980342E12, 197.23333333333332], [1.54980312E12, 345.45], [1.5498033E12, 399.0833333333333], [1.549803E12, 221.41666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}, {"data": [[1.54980336E12, 1.7833333333333334], [1.54980342E12, 20.6], [1.54980312E12, 27.133333333333333]], "isOverall": false, "label": "Petición HTTP-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54980342E12, "title": "Transactions Per Second"}},
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
